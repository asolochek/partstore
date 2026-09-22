# Partstore

A small web app for keeping track of a fastener collection stored in drawer cabinets, and for printing the drawer labels.
Each page is a class of fastener (imperial machine screws, metric machine screws, wood & sheet metal screws, screws for plastic, …) laid out as
a grid: rows are thread sizes, columns are lengths, and each cell records which head types you have at that size and length,
which drawer they live in, and optionally the drive types and materials. Nuts, lock nuts, washers and lock washers get their
own columns. Labels come out as PDFs sized for 9 mm tape on an Epson LabelWorks LW-PX900 (50 × 7 mm printable strip), in
Futura, with the head/nut/washer icons drawn on the label, and can be sent straight to the printer through a small helper
that runs on the Windows PC the printer is attached to.


## Running it

Requires Node 18+ and the label renderer from the companion Binner label tooling (`labels.js` and `pinouts.js`, expected at
`/home/aarons/binner-docs/plan-src/`; change the path at the top of `server.js` if yours differs). Futura Medium must be
installed for the labels to render in Futura.

```
npm install
node server.js          # http://127.0.0.1:8093/
```

It binds to localhost. Put a reverse proxy with authentication in front of it (`apache-vhost.example.conf` is an example with
HTTP basic auth) or reach it through an SSH tunnel: `ssh -L 8093:127.0.0.1:8093 host`. `partstore.service` is a systemd unit.
Direct printing goes through the server: the print helper connects out to it with the token in `data/helper.token`, which the
server creates on first start (keep it out of git).

The model lives in `data/fasteners.json` and is edited entirely through the page; keep it in git. `data/printed.json`
records what has been printed.

## Using the grid

- **Tabs** switch pages. On a phone the page becomes a picker and one thread size is shown at a time as a list of cards.
- **Cells**: click a head icon to tick it. The row of icons is the page's primary set plus anything else ticked in that cell;
  the **…** at the end offers every other head type for the class. More than nine icons and they shrink.
- **Screws are a head shape plus properties.** Clicking a head icon ticks that shape with the page's default tip (blunt on
  the machine pages, pointed on wood and sheet metal). **Right-click / long-press a ticked icon** for its detail: tip (blunt,
  pointed or self-drilling: a drill point), thread-cutting (a notch or slot up a blunt or pointed tip, like a wood screw's
  type 17 point), captive washers under the head (flat,
  split lock, external or internal tooth, any combination), its own location (when that head lives somewhere other than
  the rest of the cell; a badge on the icon shows it), drive types, and materials per drive. Changing tip, cutting or
  washers turns the icon into that variant, so one cell can hold, say, plain pan heads and pan heads with a captive split
  washer side by side. Hex and hex washer heads offer a hex + slotted drive. Nuts and washers get materials only. Each ticked drive + material has a **location** button of its own, so one head type's stainless screws can live in
  a different drawer or bin from its zinc ones; a `…` badge on the icon means the head is split that way.
- **Location**: click the location line at the bottom of a cell. A drawer is `12` (undivided) or `12R` / `12F` (rear or
  front half of a divided one); a bin is `B3`. Each level (cell, head type, drive + material) can also list **overflow**
  locations (`B2, 13F`): where the surplus goes once the primary location is full. A more specific level overrides the
  one above it.
- **Rows** are thread sizes (`#4-40`, `1/4-28`, `M6`, `M6x0.75`, or a bare gauge like `#6` on wood and sheet metal pages);
  **Add row…** inserts one in order, × on an empty row removes it. Lengths likewise: **Add length…** takes `7/16`, `0.4375`,
  `1-1/2` or `22`; × on an empty column removes it. **Types…** chooses which head, nut and washer types a page shows.
- **Cabinets**: drawers are numbered per category, each from 1: Imperial machine screws (green), Metric machine screws
  (blue), Wood & sheet metal screws (red). Physically they fill a row of cabinets in that order, a category's numbering
  running on across cabinets (Imperial 65–88 are the top rows of cabinet 2). **Cabinets…** on the map sets the physical
  cabinets (8 × 8 drawers, 4 × 4, 4 × 4 with three wide drawers down each side, or a 6 × 4, 6 × 2, 4 × 3 or 4 × 4 box of bins, or a custom box whose compartments you draw: **Design…** opens a grid of
  equal units; drag across empty units to make a compartment of any rectangle, click one to remove it, compartments are numbered
  row by row from the top left), their order, and how many
  drawers each category has; the last category takes the rest. Each box of bins numbers its bins from 1, and the loose bins have a numbering of their own. A page belongs
  to a category, so a drawer number on it means that category unless another is chosen. Places are always given as a name and a
  number: the location editor, the print panels and Find offer the categories, the boxes and the loose bins by name, and you
  type the number (`12R`, or `5` for a bin). Internally a place is one token with a letter for its category or box (`M12R`,
  `C5`); the letters are assigned automatically, never shown, and a box keeps its letter for good.
  The drawer map's **Cabinets…** panel names the cabinets, adds and renames categories, sets each one's letter and the colours
  of its drawer-number labels (number on label; shown on the drawer badges and the grid's location badges), and says which
  category each page belongs to; moving a page to another category leaves its stock where it is. A cabinet, a box of bins or
  the loose bins can also name the tape their part labels are printed on (say black on neon green): cards and previews are
  drawn in it, and each kind of tape prints as its own job, named in the "load the tape" prompt.
- The **Plastic Thread-Forming Screws** page (class `plastic`) is for screws with no common size system: a row is the measured
  major diameter in mm (add `2.5`), or a trade size when the packet gives one (`#4-20`); lengths are in mm; heads start blunt.
- **Category is a property of each screw.** A page has a default category (its bare drawer numbers mean that category's
  drawers), and a cell, a head or one drive + material can say otherwise, in the location editor (right-click) or in bulk with
  Find's **Set category…**. Badges on the grid, cards and bin badges on the map and Find's badges are coloured by the category
  of what is there (a blend when a place holds several; grey for an empty bin or no category); a drawer tile's own badge is
  the category its number belongs to.
- **Find** lists every screw, nut and washer by what it is rather than where it is: one line per kind (size, head, drive,
  material and finish) per place it is kept, so overflow stock has a line of its own. Chips filter by drive, finish, material,
  head, tip, page and where it is kept (alternatives within a group, all groups together: Torx + ceramic or cadmium), the
  search box by size. Tick lines and **Move ticked to…**: a bin for each size in a box or among the loose bins (empty bins, in
  order, previewed before anything is saved), or everything into one named place. Only the ticked kinds move; the rest of
  their cells stay put. **Move ticked to page…** puts the ticked kinds on another page (and so in its category) at the same
  size and length, adding the row or length there if needed and converting inches to millimetres or back; each kind keeps its
  head, drive, material and places. Undo takes a move back. **Right-click a line** for the same actions on that line alone,
  **PDF: ticked** for the labels of the ticked lines' places, and **Edit on the grid…**, which opens that head's detail panel
  on the grid page (drives, materials, tip, washers, places).
- **Cabinet** opens the drawer map, all pages at once, with a tab per physical cabinet (the Unassigned list is the same on every tab), each drawer badged with its category colour and number: every label
  is a card in its drawer half, bin, or the Unassigned column on the right. Drag a card to a half, a bin, "drop here for a
  new bin", or back to Unassigned. Dropping on an occupied half offers **Merge** (both become one label) or **Insert**,
  shifting what is there along by one half: to the next gap, the rest of the row (refused if the row's last half is in
  use), or everything after. Right-click a card to **print its label** (with the printer settings of the grid page), to **split** its label into cards per size, per head type, or per drive +
  material (they stay put until dragged, so material A can go to one drawer and material B to another), to flag it as
  **needing a whole drawer** (drawn full height; both halves must be free), or to unassign it. Right-click an empty half to
  insert or delete a space with the same three ranges; a row-scoped delete only pulls back within its row. Shifts show
  the chain of moves before they commit, and **Undo** reverts the last change. Red marks a half whose lengths skip one;
  overflow stock shows in italics.

## List pages

**Add list page…** makes a page of free-form labels for anything else that lives in a drawer: connectors, test leads,
shunts, binding posts. Each line has a tick box, the label text, an optional small detail line, a glyph picked from the
icon library (banana plugs, mini grabbers, alligator clips, DB9, flat flex ends, XT60/XT30, Deans, JST-XH, EC3, Tamiya,
plus every fastener icon), a location, a live preview and its own ⎙. **PDF: selected** prints the ticked lines; lines
print one label each. Locations, bins, the cabinet map and PDF: drawers… work the same as on the grid pages.

## Labels

- ⎙ on a cell prints that cell's label; on a row header, every label in the row. **PDF: all** prints the page,
  **PDF: unprinted** only labels that changed since the last **Mark all printed**, **PDF: drawers…** takes a list or ranges
  (`12-16, 20, 30R`) across every page, **PDF: bins…** a list of bins (`B1, B3-5` or `all`).
- Drawer labels are 50 × 9 mm and bin labels 50 × 18 mm unless the cabinet says otherwise: the drawer map's **Cabinets…** panel gives each
  cabinet, each box of bins and the loose bins a tape width (9, 12 or 18 mm) and a label length. The layouts scale with the
  tape, and the big line shrinks to fit a short label. On 18 mm tape a bin label uses the height: the size as large as fits,
  with the icons and details in a band under it, or the icons beside it when that lets the text be larger. Each label size comes as its own PDF and goes to its own printer queue
  (**Printer…** has one per size in use). Changing a size makes those labels count as unprinted.
  A print that touches both delivers the drawer labels first, then the bin labels. A bin label lists everything in the
  bin from every page: one size big with its lengths under it, or one line per size.
- A label for part of a cell says what sets that part apart: the drive or material (`pan SS`, `Phillips zinc`) and
  `overflow` for an overflow location.
- Cells that share a drawer half print as one label: `#10 Washer` with all the washer icons, `#4-40 Nut`, `#8-32/36 × 1/2″`
  when two pitches of one diameter share a drawer, or the size with the lengths listed after it. A cell split over several
  drawers asks which to print.
- Order is by drawer number, rear before front, then the unassigned cells in reading order.
- Without the helper the PDF downloads; print it from Acrobat at actual size on a queue whose defaults are set to 9 mm tape,
  auto length, cut per label. With the helper (`helper/`, see its README) connected to the server, the **Printer…** panel sends labels straight to
  the printer.

## Layout of the repo

`server.js` Express app · `model.js` length series, cell keys, label text, locations and portions (also served to the page) · `icons.js` head, nut and
washer icons · `static/index.html` the grid · `static/cabinet.html` the drawer map · `static/find.html` the filtered list and bulk move · `static/print.js` fetching and printing label PDFs, for both · `helper/` the Windows print helper ·
`data/` the model.

## License

Copyright © 2026 Aaron Solochek. Released under the GNU General Public License, version 3 — see `LICENSE`. You may use,
modify and redistribute it, provided that distributed versions carry the same license and their source.
