# Input file format

What suppliers actually send, and what can be derived from it.

This document is based on a real search result set from the **Historic England Archive**
(customer enquiry 134025, May 2022): an Excel workbook of results plus a Word document,
*Guide to Aerial Photography results list v0.1*, explaining the columns. Quotations below are
from that guide.

The sample files are **not committed** — they are supplier data belonging to a customer
enquiry. Everything needed to write and test the parser is recorded here instead.

---

## 1. What arrives

Two files:

| File | Role |
| --- | --- |
| `<enquiry>_Verticals.xls` | The results. **Excel 97–2003 binary (BIFF8), not CSV.** |
| `Guide to Aerial Photography results list.doc` | Column definitions, ordering info. Static boilerplate. |

The guide states that oblique results ship in the same workbook: *"both types of oblique
photography are shown within the excel attachment, under separate tabs."* So a full result
set is **one workbook with up to three sheets** — Verticals, Oblique, Military Oblique. The
sample contains only the Verticals sheet.

The archive's framing matters for the UI: *"your area will not necessarily be in the centre
of each photograph and may be on the edge of it."* Judging that is exactly what this app is
for.

## 2. Workbook structure

Sheets are named after an internal report code, truncated by Excel to 31 characters — the
sample's is `R2.4a - Full single listing wit`. **Do not identify sheets by tab name.**
Identify them by their header row, and specifically by **which grid reference column they
carry**: `Centre point` is verticals, `Map Reference` is obliques.

Classification asks no more than that on purpose. Whether a listing is *usable* is a separate
question — a verticals sheet still needs a scale and a film format to yield a footprint — and it
is better answered per sheet by the row parser, which can name the column at fault. Requiring
`Scale 1:` to recognise a verticals sheet would turn one renamed column into a whole discarded
tab and a vague warning, rather than twenty-nine frames and a one-line fix.

The sheet is a formatted report, not a data table:

| Rows (1-based) | Content |
| --- | --- |
| 1–12 | Blank rows, `HISTORIC ENGLAND`, `Air Photographs` banner |
| 10 | Title: `Full single listing - Verticals, Standard order` |
| 11 | `Customer enquiry reference: 134025` |
| **13** | **Header row** |
| 14 | Header continuation — only `(in inches)`, under `Focal length` |
| **15 – 43** | **Data**, one row per frame (29 in the sample) |
| 44–45 | `Total Sorties ` / `Total Frames` trailer, values two columns right of the label |

The trailer's two columns are not an offset to hard-code: the label is itself merged across `O:P`,
so its value lands in `Q`, the next populated cell. Read the first number to the right of the
label instead. (`Total Sorties ` has a trailing space, like `Focal length ` — see §3.)

So: find the header row by content, and take data until the `Total …` trailer or the end of the
sheet. Do not assume fixed row numbers — a different report template will move them.

## 3. Verticals sheet columns

Column letters are from the sample. There are blank spacer columns and merged header cells,
so **map columns by header text, not by index**.

| Col | Header | Type | Example | Notes |
| --- | --- | --- | --- | --- |
| A | — | — | | Empty spacer |
| B | `Sortie number` | text | `MAL/67055`, `OS/71509`, `MAL/74049(Z)` | Flight reference from the source organisation |
| C | `Library  number` | **text** | `4777`, `5356A` | Note the double space in the header. Not numeric — `5356A` |
| D | `Camera position` | text | `V` | See §5 |
| E | `Frame number` | number | `23`, `84282` | Stored as a float; render as an integer |
| F | `Held` | text | `P` / `N` | `P` = print held; `N` = no print, negative or slide may exist |
| G | `Centre point` | text | `SK 421 849` | **Six-figure grid reference, centre of the frame.** Merged G:H |
| I | `Run` | number | `1` | Which run of the sortie |
| J | `Date` | **text** | `13 JUN 1967` | `dd MMM yyyy` as a string, *not* an Excel date. Merged J:L |
| M | `Sortie quality` | text | `A` | Assigned by the organisation that flew it. Merged M:N |
| O | `Scale 1:` | number | `10500` | Scale **denominator**. See the caveat in §4 |
| P | `Focal length ` `(in inches)` | number | `6`, `12` | **Inches**, per the row-14 continuation. Trailing space in the header |
| Q | `Film details (in inches)` | text | `Black and White 9 x 9` | Type and format. Merged Q:R |
| S | `Film held by` | text | `NMR` | Where the negative lives |

Header whitespace and punctuation are noise and vary within a single row: `Library  number` has a
double space, `Focal length ` and `Total Sorties ` trailing ones, `Scale 1:` a colon, and
`Film details (in inches)` a parenthesised qualifier that a template could equally put in a
continuation row. Match headers with all of that folded away — but read the unit out of the
qualifier before discarding it, or a 6″ lens becomes 6 mm.

Sample coverage: 29 frames, scales 1:2500 to 1:12000, focal lengths 6″ and 12″, every frame
`9 x 9` inches, dates 1960–2009.

## 4. What can be derived

Everything needed for a footprint is present, and **the scale is given directly** — no flying
height or terrain lookup required:

```
ground side = film side × scale denominator
```

`9 x 9` inches at 1:10500 → `0.2286 m × 10500` = **2400 m square**.

The guide includes its own scale-to-area table, which is an independent check on that formula:

| Scale | Guide says | 9″ × scale gives | Area |
| --- | --- | --- | --- |
| 1:2500 | c. 0.13 sq miles | 571.5 m | 0.126 sq miles |
| 1:10 000 | c. 2 sq miles | 2286 m | 2.018 sq miles |
| 1:15 000 | c. 4.5 sq miles | 3429 m | 4.540 sq miles |

All three agree. Use them as test cases.

**Focal length is redundant for the footprint** but yields the flying height, which is worth
displaying: `H = focal length × scale denominator`. The sample's values come out at round
foot heights — 6″ at 1:10500 is 5250 ft, 12″ at 1:7000 is 7000 ft — which confirms these are
genuine planned survey scales. (With a 12″ lens the scale denominator simply *is* the flying
height in feet.)

**The scale is nominal.** The guide is explicit: *"the target scale which the survey aimed to
achieve. Each photograph, however, may be at slight variance because of changes in the
aircraft's altitude or the height of land covered."* Footprints are therefore approximate,
and the UI should present them as indicative extents rather than surveyed boundaries.

**Positional precision.** Centre points are six-figure — a 100 m square, so ±50 m. Against a
2286 m footprint that is about ±2%, smaller than the scale variance above.

**No heading is supplied.** There is no bearing column, so footprints are drawn aligned to
grid north. `Run` tells you which frames share a flight line, and a run's frames could in
principle have a bearing fitted through their centre points — but that is an inference, not
data, and the sample has too few frames per run to try it.

Worked example, first sample row:

```
MAL/67055, frame 23, SK 421 849, 1:10500, 6", Black and White 9 x 9

grid ref  →  E 442150, N 384950          (centre of the 100 m square)
WGS84     →  53.359754 N, 1.368131 W
ground    →  0.2286 × 10500 = 2400.3 m square
height    →  0.1524 × 10500 = 1600 m AGL (5250 ft)
corners   →  E 442150 ± 1200.2, N 384950 ± 1200.2, converted individually
```

Skipping the OSGB36→WGS84 conversion on this row puts it **107 m** out (102 m east, 31 m
south) — see `archive/MATHS.md` §3.

## 5. Fields that are not what they look like

- **`Camera position` is not a vertical/oblique flag.** The guide defines it as indicating
  *"the position of cameras on an aircraft"*, quoted as a prefix to the frame number. A
  split-vertical installation has several. The sample only ever shows `V`; the full code set
  is unknown. The **sheet** determines vertical versus oblique, not this column.
- **`Library  number` is text** despite looking numeric (`5356A`), and its header contains a
  double space.
- **`Date` is text**, not an Excel serial. Parse `dd MMM yyyy`; keep the original string for
  display.
- **`Frame number` is a float** from Excel. `23.0` must render as `23`. Older sorties carry
  large frame numbers (`84282`, `127170`).
- **`Film details` is a free-text string** combining type and format: `Black and White 9 x 9`,
  `Colour 9 x 9`. Dimensions are inches here, but the guide's oblique examples use
  `Black and White 35mm` and `Digital Colour 35mm`, so the parser must handle a `W x H`
  form, a single-dimension form, and both units.

## 6. Oblique sheets

Not in the sample — no oblique result set has been seen yet. From the guide, obliques carry:

| Field | Notes |
| --- | --- |
| `Photo Reference (NGR and Index Number)` | Per-photograph reference |
| `Film and Frame Number` | Letter code for the source, plus film and frame |
| `Original Number` | Reference assigned by the original source |
| `Date` | |
| `Film type` | e.g. `Black and White 35mm`, `Digital Colour 35mm` |
| `Map Reference (6 figure grid ref)` | Six-figure grid reference, centre of the photograph |

The decisive point: **there is no scale, no focal length, no camera height and no bearing.**
A footprint is not derivable from an oblique record, and no amount of care in the code will
change that. *"Oblique photographs are taken by cameras fixed at an angle or hand-held"* —
the ground shape is a trapezoid whose size and orientation depend on parameters the listing
does not contain.

So obliques are plotted as **points with their ±50 m uncertainty**, clearly distinguished
from vertical footprints. Anything else would be invention.

One useful affordance: the guide notes obliques with frame numbers beginning `EPW` or `EAW`
can be viewed at [Britain from Above](https://www.britainfromabove.org.uk). Those are worth
turning into links.

## 7. Consequences for the app

1. **Read `.xls`, not CSV.** An XLSX/XLS reader is a hard requirement — SheetJS handles both.
   Accept `.xlsx` too; newer enquiries may well ship it.
2. **Locate the header by content**, then map columns by header text. Row and column
   positions will not hold across report templates.
3. **Handle multiple sheets**, classify each by its header row, and parse verticals and
   obliques into different record types.
4. **Two record types.** `VerticalRecord` yields a footprint polygon; `ObliqueRecord` yields a
   point. The map layer must render both.
5. **Carry the provenance columns through** — sortie, library number, frame, run, date,
   quality, held, film held by. They are how a customer actually places an order, so they
   belong in the detail panel and in any export.
6. **Skip the trailer rows**, and cross-check the parsed count against `Total Frames` as a
   free validation of the parse.

### 7.1 What the reader actually does

`src/io/readWorkbook.ts` implements the above. Its rules, so a future change has something to
change *against*:

| Situation | What happens |
| --- | --- |
| Banner rows above the header | Skipped: the header row is the first row matching three or more known column headers |
| Header continuation row | Folded into the header above, so `Focal length ` + `(in inches)` reads as one header and the unit is not lost |
| Blank row *inside* the listing | Skipped, and reading continues. Stopping there would silently lose every frame below it |
| The header block repeated further down | Skipped — a long report may reprint it, and that is not a bad row |
| `Total Sorties` / `Total Frames` | Ends the listing; the value is the first number to the right of the label |
| A row below the trailer | Not read, and reported as a warning. Silently dropping it is how frames go missing |
| A sheet with no recognisable header | Skipped with a warning naming what a listing's headers look like |
| Any other unrecognised row | Treated as data, and so reported per row with its line number and reason |

The last two lines are the point: **the reader guesses at nothing and drops nothing quietly.**
A row it cannot make sense of becomes a `ParseIssue` against its own line number, and the other
forty-nine frames still reach the map.

## 8. Still unknown

- The oblique sheet's actual layout — column order, header wording, spacer columns. §6 is
  from the guide's prose only.
- The full `Camera position` code set.
- Whether other suppliers (NCAP, Aerofilms, local authorities) use comparable layouts. Assume
  not; the header-driven approach above is what makes a second format cheap to add.
- Whether recent enquiries ship `.xlsx` rather than `.xls`.

Extending this format is fine. Quietly assuming a different one is not — update this document
in the same change.
