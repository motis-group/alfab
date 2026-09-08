# CAD File Import (Calculator)

The ad hoc pricing calculator (`/glass/quote`) and the ad hoc line editor on the purchase order page (`/glass/new`) accept a customer's 2D CAD drawing and fill in the glass geometry automatically: width, height, shape class, radius corners, hole count, and the measured area and edge length used for pricing. Glass type, thickness, ceramic banding and scanning are never changed by an import.

## Supported files

| Format | How it is read | Notes |
| --- | --- | --- |
| DXF (ASCII, any release from R12 up) | In the browser | Preferred exchange format. AutoCAD: `SAVEAS` → DXF. |
| DXF (binary) | In the browser | Detected by the `AutoCAD Binary DXF` header. |
| DWG | Converted to DXF on the server, then read in the browser | Needs LibreDWG on the server, see below. |
| SVG | In the browser | Physical units come from `width`/`height` + `viewBox`. |

Files that cannot be measured (PDF, images, STEP/IGES/STL, AI/EPS, zip) are rejected with a message telling the user what to ask the customer for.

Entities read from DXF: `LINE`, `ARC`, `CIRCLE`, `ELLIPSE`, `LWPOLYLINE` (with bulges), `POLYLINE`/`VERTEX`, `SPLINE` (NURBS or fit points), `INSERT` (blocks, including scale/rotation/arrays) and `HATCH` boundaries as a fallback. Text, dimensions, leaders, solids, 3D entities, frozen/off layers, invisible entities and paper space are ignored.

Elements read from SVG: `rect` (including `rx`/`ry`), `circle`, `ellipse`, `line`, `polyline`, `polygon` and `path` (all commands, including arcs and beziers), with nested `transform`s applied. `<use>` references and `<defs>` content are not expanded.

## How the outline is chosen

1. All geometry is scaled to millimetres. DXF uses `$INSUNITS`; if a file has no units (common for R12 exports) millimetres are assumed unless `$MEASUREMENT` says the drawing is imperial, and the panel shows a warning with a units override.
2. Open lines and arcs whose ends meet (within 0.05 mm, or 0.02% of the drawing size) are chained into closed loops. Open chains such as dimension lines and centre lines are ignored.
3. Closed loops are ranked by area. Loops on layers named like `BORDER`, `TITLE`, `FRAME`, `DIM…` or `TEXT` and rectangles that enclose another sizeable loop are treated as drawing borders and skipped; loops on layers named like `GLASS`, `GLAZING`, `PANEL` or `OUTLINE` are preferred. The user can pick another loop from the **Glass outline** list.
4. Closed loops inside the outline are holes. Circles are counted (concentric circles such as a hole with a countersink count once); non-round cutouts are reported but not priced.

## Shape classification

| Outline | Calculator shape | Extra fields |
| --- | --- | --- |
| 4 straight edges at right angles | Rectangle | Rotated rectangles report their true side lengths. |
| Rectangle with tangent corner arcs | Rectangle | Radius corners on, corner radius shown. |
| 3 straight edges | Triangle | |
| 4–6 straight edges, convex (trapezoid, rake, cut corners) | Simple Shape | |
| Curved edges, circles, ellipses, notches, or more than 6 edges | Complex Shape | Edgework switches from a `STRAIGHT` to the matching `CURVED` variant (and back) when the current edgework is grind or polish. |

Tiny corner clean-up segments (up to 2 mm) are collapsed before counting edges so they do not turn a rectangle into an 8-sided shape.

## The glass visualizer

`components/GlassVisualizer.tsx` draws the panel above the calculator on `/glass/quote` and above the
ad hoc calculator in a purchase order line. It works from the specification alone, so it is useful
whether or not a CAD file was uploaded:

- **With a CAD outline** it draws the real measured profile, its holes and any cutouts, and labels the
  source file. The points come from `cadOutline.geometry`, which `buildCadOutline` stores with the
  specification (decimated to at most 240 points and rounded to 0.1 mm) so the shape survives into
  purchase order lines without re-reading the file.
- **Without one** it draws a rectangle, a right-angled triangle for `TRIANGLE` (matching the costing
  formulas), or, for `SIMPLE`/`COMPLEX`, a dashed width x height envelope with a note that the real
  profile is unknown. Hole markers are then positioned indicatively and labelled as such, because only
  the hole count affects the price.

Glass type tints the fill via `glassTypeToRGB`, ceramic banding is drawn as an inner band, and the
width and height carry dimension lines. The drawing is laid out in a fixed SVG viewBox with
millimetres mapped into it, so line weights and labels stay legible for a 200 mm pane or a 4 m one.

## Pricing with a CAD outline

With a CAD outline attached, `calculateCost` prices base glass and ceramic banding on the measured outline area and edgework on the measured edge length (the same idea the calculator already uses for triangles). The **Price on the measured outline** checkbox in the panel turns this off so the calculator falls back to the width × height formulas; the measured values are still stored for reference. The outline summary travels with the specification into purchase order lines (`adhocSpecification.cadOutline`) and saved quotes.

If width or height are edited by hand after an import, pricing keeps using the measured outline and the panel says so; **Re-apply from file** restores the file values and **Remove CAD data** returns to normal width × height pricing.

## DWG conversion on the server

DWG is a closed binary format, so `/api/cad/convert` shells out to LibreDWG's `dwg2dxf`. On Debian/Ubuntu:

```bash
sudo apt install libredwg-tools
```

If the binary is not on `PATH`, point the app at it:

```bash
CAD_DWG2DXF_PATH=/usr/local/bin/dwg2dxf
```

The route only accepts real DWG files (header `AC10xx`) up to 40 MB from a signed-in session, converts them in a temporary directory with a 90 s timeout, and returns the DXF text. When the converter is missing the panel tells the user to export a DXF instead. `GET /api/cad/convert` reports whether the converter is available.

## Tests

```bash
npm test
```

runs the CAD parser and analysis tests in `utils/cad/cad.test.ts` against the fixtures in `utils/cad/__fixtures__` (DXF files generated with ezdxf for R12/R2000/R2010, a binary DXF, and hand-written SVGs).
