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

`components/GlassVisualizer.tsx` draws the panel in the calculator's left column on `/glass/quote`,
directly beneath the price breakdown. It is deliberately only on the calculator: purchase order lines
show the numbers, not the drawing. It works from the specification alone, so it is useful whether or
not a CAD file was uploaded:

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
millimetres mapped into it, so line weights and labels stay the same size for a 200 mm pane or a 4 m
one. That viewBox is kept small on purpose: the sidebar is around 400 px wide, and a larger box would
shrink the dimension labels below a readable size.

## Pricing with a CAD outline

With a CAD outline attached, `calculateCost` prices base glass and ceramic banding on the measured outline area and edgework on the measured edge length (the same idea the calculator already uses for triangles). The **Price on the measured outline** checkbox in the panel turns this off so the calculator falls back to the width × height formulas; the measured values are still stored for reference. The outline summary travels with the specification into purchase order lines (`adhocSpecification.cadOutline`) and saved quotes.

If width or height are edited by hand after an import, pricing keeps using the measured outline and the panel says so; **Re-apply from file** restores the file values and **Remove CAD data** returns to normal width × height pricing.

## DWG conversion on the server

DWG is a closed binary format, so `/api/cad/convert` shells out to LibreDWG's `dwg2dxf`.

Ubuntu does not ship LibreDWG in its archive (the `libredwg-tools` package is Debian-only), so it is
built from the pinned upstream release by `scripts/install-libredwg.sh`. The script is idempotent: it
exits early when a working `dwg2dxf` is already present, and takes `--force` to rebuild.

Run it on production with the **Install LibreDWG on Production** GitHub Action
(`.github/workflows/install-libredwg.yml`, run manually from the Actions tab). It uses the same
deploy secrets as the release workflow. Run it once, and again when the pinned version changes.

The workflow builds on the CI runner, not on the droplet, and copies the finished binary across. The
first attempt built on the droplet and the SSH session dropped after four minutes on that 1 vCPU /
1 GB box. Because `--disable-shared` links libredwg into `dwg2dxf`, the binary needs only libc and
libm, so it moves between hosts of the same distribution: about 18 MB stripped. The workflow compares
the runner's and the droplet's glibc first and stops with a clear message if the droplet's is older,
in which case build on the droplet by hand instead.

It is deliberately kept out of the deploy path: it only needs running once, and a failure must never
be able to break a release.

To install by hand on any Debian or Ubuntu host:

```bash
sudo bash scripts/install-libredwg.sh
```

`scripts/bootstrap-vps-1gb.sh` calls the same script, so a freshly provisioned server has it already.
Bootstrap runs on the console rather than over SSH, and configures swap before it gets there, so the
on-host build is fine in that context.

`BUILD_ONLY=1 PREFIX=<dir>` builds and stages the binary without touching the system, which is how
the workflow produces the artifact it ships.

If the binary lives somewhere other than `PATH`, point the app at it:

```bash
CAD_DWG2DXF_PATH=/usr/local/bin/dwg2dxf
```

The route only accepts real DWG files (header `AC10xx`) up to 40 MB from a signed-in session, converts them in a temporary directory with a 90 s timeout, and returns the DXF text. When the converter is missing the panel tells the user to export a DXF instead. `GET /api/cad/convert` reports whether the converter is available.

`dwg2dxf` exits 0 even when it only partly understood a drawing, writing a DXF with an empty
`ENTITIES` section. `convertDwgBufferToDxf` checks for that and reports it as a conversion failure,
quoting the converter's own error, so a half-converted DWG is not blamed on the customer's drawing.

## Tests

```bash
npm test
```

runs the CAD parser and analysis tests in `utils/cad/cad.test.ts` against the fixtures in
`utils/cad/__fixtures__` (DXF files generated with ezdxf for R12/R2000/R2010, a binary DXF, and
hand-written SVGs), plus `utils/cad/dwg-server.test.ts`, which drives the DWG conversion helper
through stub converters covering the missing-binary, non-zero-exit, empty-output and
converted-but-empty cases.

There is no DWG fixture in the repository: LibreDWG's DWG *writer* is experimental and produces files
its own reader rejects, so a synthetic DWG would test nothing. The conversion helper is covered with
stubs instead, and the real `dwg2dxf` path is exercised by uploading a DWG produced by an actual CAD
package.
