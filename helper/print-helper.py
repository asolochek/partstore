#!/usr/bin/env python3
# Copyright (C) 2026 Aaron Solochek. Licensed under the GNU GPL v3; see LICENSE.
"""Print helper for the label printer. Runs on the Windows PC the Epson LW-PX900 is attached to and prints label PDFs
silently on a named printer queue using that queue's saved defaults (tape width, auto length, cut per label - set once in the
queue's Printing Preferences, one queue per tape width).

Normal use: it connects out to the Partstore server and collects the print jobs the page leaves there, so nothing has to reach
this PC from outside and the page can be served over https:
    python print-helper.py --server https://partstore.example.org --token SECRET [--backend acrobat|gs|sumatra] [--exe "C:\\path\\to\\program.exe"]
(the token is the contents of data/helper.token on the server)

Without --server it listens on the LAN instead, for anything that POSTs PDFs to it:
    python print-helper.py [--port 8094] [--token SECRET] [--bind 0.0.0.0] [--backend ...] [--exe ...]
Runs fine under pythonw.exe (no console, e.g. from a logon task): it then logs to print-helper.log beside the script.

Backends, tried in this order unless --backend is given:
    acrobat  Adobe Acrobat / Reader  "/t file printer" - prints exactly like File > Print with the queue defaults (what works by hand)
    gs       Ghostscript (gswin64c) mswinpr2 device  - hands the page to the queue at 1:1, no paper matching
    sumatra  SumatraPDF -print-to  - NOT suitable for the label queues: it picks a driver paper by page size (cuts labels short)

Endpoints when listening (CORS open, so a browser page served from elsewhere can call them):
    GET  /printers                         -> JSON list of installed printer names + which backend is in use
    POST /print?printer=NAME[&token=..]    -> body = the PDF; prints it, returns {"ok":true,"pages":N,"backend":..}
    GET  /                                  -> a tiny status page
Python 3.8+ standard library only.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from urllib.parse import unquote
VERSION = '2026-09-19.1'   # shown by GET / and /printers and on startup; bump on every change
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ARGS = None

HERE = os.path.dirname(os.path.abspath(__file__))
def first_existing(cands):
    for c in cands:
        if c and os.path.exists(c): return c
    return None
def env(v): return os.path.expandvars(v)
CANDIDATES = {
    'acrobat': lambda: first_existing([env(r'%ProgramFiles%\Adobe\Acrobat DC\Acrobat\Acrobat.exe'), env(r'%ProgramFiles(x86)%\Adobe\Acrobat DC\Acrobat\Acrobat.exe'),
                                       env(r'%ProgramFiles%\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe'), env(r'%ProgramFiles(x86)%\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe'),
                                       env(r'%ProgramFiles%\Adobe\Acrobat\Acrobat\Acrobat.exe'), shutil.which('Acrobat.exe'), shutil.which('AcroRd32.exe')]),
    'gs':      lambda: first_existing([shutil.which('gswin64c'), shutil.which('gswin32c')] +
                                      sorted(__import__('glob').glob(env(r'%ProgramFiles%\gs\gs*\bin\gswin64c.exe')), reverse=True) + [os.path.join(HERE, 'gswin64c.exe')]),
    'sumatra': lambda: first_existing([shutil.which('SumatraPDF'), shutil.which('SumatraPDF.exe'), env(r'%LOCALAPPDATA%\SumatraPDF\SumatraPDF.exe'),
                                       env(r'%ProgramFiles%\SumatraPDF\SumatraPDF.exe'), env(r'%ProgramFiles(x86)%\SumatraPDF\SumatraPDF.exe'), os.path.join(HERE, 'SumatraPDF.exe')]),
}
def backend():
    """(name, exe) of the print program to use"""
    if ARGS.backend:
        exe = ARGS.exe or CANDIDATES[ARGS.backend](); return (ARGS.backend, exe)
    for name in ('acrobat', 'gs', 'sumatra'):
        exe = CANDIDATES[name]()
        if exe: return (name, exe)
    return (None, None)
class QueueWatch:
    """Samples a printer's Windows print queue a few times a second (one PowerShell process for the duration of a print), so the
    helper can tell when Acrobat has handed its job over. jobs = number of jobs in the queue, spooling = one is still being written."""
    def __init__(self, printer):
        self.samples = []; self.p = None
        if sys.platform != 'win32': return
        cmd = ("$n='%s'; while($true){ try { $j=@(Get-PrintJob -PrinterName $n -ErrorAction Stop); "
               "$s=@($j | Where-Object { \"$($_.JobStatus)\" -match 'Spooling' }).Count; \"$($j.Count) $s\" } catch { 'ERR' }; "
               "Start-Sleep -Milliseconds 300 }") % printer.replace("'", "''")
        try:
            self.p = subprocess.Popen(['powershell', '-NoProfile', '-Command', cmd], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, creationflags=0x08000000)   # no console window
            threading.Thread(target=self._read, daemon=True).start()
        except Exception: self.p = None
    def _read(self):
        try:
            for line in self.p.stdout:
                a = line.split()
                if len(a) == 2 and a[0].isdigit() and a[1].isdigit(): self.samples.append((int(a[0]), int(a[1])))
        except Exception: pass
    def close(self):
        try:
            if self.p: self.p.kill()
        except Exception: pass

def print_acrobat(exe, path, printer):
    """Acrobat /t prints silently but never exits by itself, so waiting for it would hold every print up for minutes (and a driver
    dialog such as "load the 18 mm tape" even longer). Instead: watch the queue until the job is in it and fully spooled, then close
    that Acrobat. From there Windows owns the job; a tape dialog no longer concerns the helper."""
    w = QueueWatch(printer); t0 = time.time()
    while w.p and not w.samples and time.time() - t0 < 6: time.sleep(0.1)
    base, start = (w.samples[-1][0] if w.samples else 0), len(w.samples)
    p = subprocess.Popen([exe, '/n', '/t', path, printer])
    seen = False; quiet = 0; t0 = time.time(); note = 'acrobat'
    try:
        if not w.samples:
            note = 'acrobat (print queue could not be watched; waited 20 s)'; time.sleep(20)
        else:
            while time.time() - t0 < 60:
                if p.poll() is not None: break
                new = w.samples[start:]
                if any(j > base for j, _ in new): seen = True
                if seen:
                    quiet = quiet + 1 if new and new[-1][1] == 0 else 0   # nothing spooling any more
                    if quiet >= 4: break
                time.sleep(0.3)
            if not seen: note = 'acrobat (the job was not seen in the print queue within 60 s)'; log('%s WARNING: %s' % (time.strftime('%H:%M:%S'), note))
            time.sleep(1.5)
    finally:
        w.close()
        try: p.kill()
        except Exception: pass
    return (True, note)

def print_pdf(name, exe, path, printer):
    """run the backend; returns (ok, message)"""
    if name == 'acrobat': return print_acrobat(exe, path, printer)
    if name == 'gs':
        r = subprocess.run([exe, '-dBATCH', '-dNOPAUSE', '-dNoCancel', '-dNOSAFER', '-q', '-sDEVICE=mswinpr2', f'-sOutputFile=%printer%{printer}', path], capture_output=True, text=True, timeout=300)
        return (r.returncode == 0, (r.stderr or r.stdout).strip()[:300] or 'gs')
    r = subprocess.run([exe, '-print-to', printer, '-print-settings', 'noscale', '-silent', path], capture_output=True, text=True, timeout=300)
    return (r.returncode == 0, (r.stderr or r.stdout).strip()[:300] or 'sumatra')

def printers():
    if sys.platform != 'win32': return []
    try:
        out = subprocess.run(['powershell', '-NoProfile', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'], capture_output=True, text=True, timeout=20).stdout
        return [l.strip() for l in out.splitlines() if l.strip()]
    except Exception:
        try:
            import winreg
            k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows NT\CurrentVersion\Devices')
            names = []
            i = 0
            while True:
                try: names.append(winreg.EnumValue(k, i)[0]); i += 1
                except OSError: break
            return names
        except Exception:
            return []

# under pythonw.exe (no console) sys.stderr is None: log to print-helper.log beside the script instead
def log(line):
    if sys.stderr is not None:
        sys.stderr.write(line + '\n'); sys.stderr.flush(); return
    try:
        with open(os.path.join(HERE, 'print-helper.log'), 'a', encoding='utf-8') as f: f.write(line + '\n')
    except OSError: pass
def count_pages(data):
    return max(1, data.count(b'/Type /Page') - data.count(b'/Type /Pages')) if b'/Type /Page' in data else 0

class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Token')
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code); self._cors(); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def _auth(self, q):
        if not ARGS.token: return True
        return (q.get('token', [''])[0] or self.headers.get('X-Token', '')) == ARGS.token
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if u.path == '/printers':
            if not self._auth(q): return self._json(403, {'error': 'bad token'})
            name, exe = backend(); return self._json(200, {'printers': printers(), 'backend': name, 'exe': exe, 'sumatra': exe, 'version': VERSION})
        name, exe = backend()
        body = f'<h3>Label print helper {VERSION}</h3><p>Backend: {name or "NONE FOUND"} ({exe})</p><p>Printers: {", ".join(printers()) or "(none listed)"}</p>'.encode()
        self.send_response(200); self._cors(); self.send_header('Content-Type', 'text/html'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_POST(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if u.path != '/print': return self._json(404, {'error': 'no such endpoint'})
        if not self._auth(q): return self._json(403, {'error': 'bad token'})
        printer = q.get('printer', [''])[0]
        if not printer: return self._json(400, {'error': 'printer= is required'})
        n = int(self.headers.get('Content-Length', '0')); data = self.rfile.read(n)
        if not data.startswith(b'%PDF'): return self._json(400, {'error': 'body is not a PDF'})
        name, exe = backend()
        if not exe: return self._json(500, {'error': 'no print program found: install Acrobat Reader or Ghostscript, or pass --backend/--exe'})
        fd, path = tempfile.mkstemp(suffix='.pdf', prefix='labels-'); os.write(fd, data); os.close(fd)
        try:
            ok, msg = print_pdf(name, exe, path, printer)
            if not ok: return self._json(500, {'error': f'{name}: {msg}'})
            self.log_message('printed %d page(s) to %s via %s', count_pages(data), printer, name)
            return self._json(200, {'ok': True, 'pages': count_pages(data), 'printer': printer, 'backend': name})
        finally:
            try: time.sleep(3); os.remove(path)
            except OSError: pass
    def log_message(self, fmt, *a): log('%s %s' % (time.strftime('%H:%M:%S'), fmt % a))

def print_bytes(data, printer):
    """print one PDF held in memory; returns (ok, pages, backend name, message)"""
    name, exe = backend()
    if not exe: return (False, 0, None, 'no print program found: install Acrobat Reader or Ghostscript, or pass --backend/--exe')
    fd, path = tempfile.mkstemp(suffix='.pdf', prefix='labels-'); os.write(fd, data); os.close(fd)
    try:
        ok, msg = print_pdf(name, exe, path, printer)
        return (ok, count_pages(data), name, msg)
    finally:
        try: time.sleep(3); os.remove(path)
        except OSError: pass

def poll(server, token):
    """collect jobs from the Partstore server for ever: long-poll /api/helper/next, print, report to /api/helper/done"""
    base = server.rstrip('/')
    def call(path, body=None, timeout=60):
        req = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(), headers={'X-Token': token, 'Content-Type': 'application/json', 'User-Agent': 'print-helper/' + VERSION})
        return urllib.request.urlopen(req, timeout=timeout)
    hello = 0; wait = 2; down = False
    while True:
        try:
            if time.time() - hello > 600:
                name, exe = backend(); call('/api/helper/hello', {'printers': printers(), 'backend': name, 'version': VERSION}).read(); hello = time.time()
            r = call('/api/helper/next')
            if down: log('%s connected to %s again' % (time.strftime('%H:%M:%S'), base)); down = False
            wait = 2
            if r.status != 200: r.read(); continue
            job, printer, data = r.headers.get('X-Job'), unquote(r.headers.get('X-Printer', '')), r.read()
            # while it prints it cannot poll: a ping every 15 s tells the server it is busy, not gone
            busy = threading.Event()
            def pings():
                while not busy.wait(15):
                    try: call('/api/helper/ping', {'job': job}, timeout=20).read()
                    except Exception: pass
            threading.Thread(target=pings, daemon=True).start()
            try: ok, pages, name, msg = print_bytes(data, printer)
            except Exception as e: ok, pages, name, msg = False, 0, None, str(e)
            finally: busy.set()
            log('%s job %s: %s %d page(s) to %s via %s%s' % (time.strftime('%H:%M:%S'), job, 'printed' if ok else 'FAILED', pages, printer, name, '' if ok else ': ' + msg))
            call('/api/helper/done', {'job': job, 'ok': ok, 'pages': pages, 'backend': name, 'error': None if ok else f'{name}: {msg}'}).read()
        except urllib.error.HTTPError as e:
            if e.code == 403: log('%s the server refused the token (HTTP 403); check --token against data/helper.token' % time.strftime('%H:%M:%S'))
            else: log('%s server answered HTTP %d' % (time.strftime('%H:%M:%S'), e.code))
            hello = 0; down = True; time.sleep(wait); wait = min(wait * 2, 60)
        except Exception as e:
            if not down: log('%s cannot reach %s: %s (retrying)' % (time.strftime('%H:%M:%S'), base, e))
            hello = 0; down = True; time.sleep(wait); wait = min(wait * 2, 60)

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--version', action='version', version=VERSION)
    ap.add_argument('--port', type=int, default=8094); ap.add_argument('--bind', default='0.0.0.0', help='0.0.0.0 = accept connections from the LAN (default); 127.0.0.1 = this PC only')
    ap.add_argument('--server', default='', help='Partstore address, e.g. https://partstore.example.org: collect print jobs from it instead of listening')
    ap.add_argument('--token', default='', help='with --server: the server\'s helper token; listening: if set, callers must send ?token= or X-Token')
    ap.add_argument('--backend', choices=['acrobat', 'gs', 'sumatra'], default='', help='print program (default: first found of acrobat, gs, sumatra)')
    ap.add_argument('--exe', default='', help='path to that program, if it is not found automatically')
    ARGS = ap.parse_args()
    name, exe = backend()
    if ARGS.server:
        if not ARGS.token: sys.exit('--server needs --token (the contents of data/helper.token on the server)')
        log(f'label print helper {VERSION} collecting jobs from {ARGS.server}  backend: {name or "NONE FOUND"} ({exe})  printers: {printers() or "(none)"}')
        poll(ARGS.server, ARGS.token)
    log(f'label print helper {VERSION} on http://{ARGS.bind}:{ARGS.port}/  backend: {name or "NONE FOUND"} ({exe})  printers: {printers() or "(none)"}')
    if ARGS.bind == '0.0.0.0':
        # listen on IPv6 and IPv4 at once, so http://localhost:8094/ works whichever the browser tries first
        import socket
        class DualStack(ThreadingHTTPServer):
            address_family = socket.AF_INET6
            def server_bind(self):
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0); super().server_bind()
        try: DualStack(('::', ARGS.port), H).serve_forever()
        except OSError: ThreadingHTTPServer((ARGS.bind, ARGS.port), H).serve_forever()
    else:
        ThreadingHTTPServer((ARGS.bind, ARGS.port), H).serve_forever()
