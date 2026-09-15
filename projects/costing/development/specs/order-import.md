# Reading a customer's order

Customers send glass orders as a typed cut list or as a drawing, often handwritten. The panel
**Read a customer's order** on the quote page (`/glass/quotes/<id>`) takes an order as a PDF or a
Word document. It reads every piece out of the order, prices each one on the glass rates, and shows
them for the estimator to check before any of them goes on the quote.

The CAD import in [cad-import.md](cad-import.md) reads one exact outline out of a drawing file, for
one line in the glass calculator. This panel reads a whole order out of a document that was never
meant for a machine, and is never trusted the way a DXF is.

## Code reads what is exact, the model reads what needs judgement

A cut list is a column of numbers. `readCutList` parses it with a regular expression: 43 sizes come
back as 43 sizes, and a line that does not parse is reported rather than dropped. A model asked to
copy the same column can drop one line and say nothing, which is a wrong quote nobody can see.

Code parses a cut list only from a Word document. For a Word document, the model is asked only what
the words mean. In the header `6mm Supergrey, toughened polished edges, NO stamps, Delivery to Eildon`
there is one thickness, one glass type and one edge finish the calculator holds, and three things it
does not. The model maps the first three onto the calculator's options and puts the rest in warnings.

The model reads a PDF whole, a typed cut list included. Every piece read from a PDF is marked
**check against the drawing** in the review table.

## A sketched shape is priced by the CAD pipeline

For a piece that is not a rectangle the model returns the outline as points in millimetres.
`applySketchToSpec` writes those points as an SVG at 1:1 and sends it through `parseCadDocument`,
`analyzeCadDocument` and `buildCadOutline` — the same path a DXF takes.

A shape read off a sketch is therefore classified, measured and priced by the same code as the same
shape imported from a CAD file, and cannot disagree with it. It also means the shape charge, the
curved-edgework switch, radius corners and hole counting all apply without being written twice.

This matters most where a bounding box is wrong. The notched piece in `utils/import/import.test.ts`
measures 0.700 m² against a 317 x 2308 bounding box of 0.732 m². Pricing the box overcharges the
customer by 4.5% on that piece.

## What the estimator sees

One row per piece: the size, the shape, the measured area where one was taken, the quantity, and
what the piece costs at the shop's own rates. Rows are ticked by default. The estimator can untick a
row and correct a quantity in place. **Add N To Quote** puts each ticked row on the quote as a
cut-glass line at cost, and the margin of the quote makes the price. Edit sends a line to the glass
calculator, like any other line. See [quotes.md](quotes.md).

Warnings about the whole order sit above the table, under **CHECK BEFORE QUOTING**:

- a treatment the calculator cannot price, toughening among them
- a line that looks like a size but did not parse
- a glass and thickness the shop does not stock, and what was used instead
- anything the model could not read off the drawing

A note about one piece sits in the row of that piece. It says when the hole count on the drawing does
not match the measured outline, when an outline could not be measured, or when a piece is not a
rectangle and has no outline.

## Toughening is not a field

`GlassSpecification` has no toughening flag. Either the 6 mm Super Grey rate already includes
toughening, or a toughened job prices short. No decision document records which. The model is told to
put toughening in its notes, the panel shows those notes as warnings, and the estimator prices
toughening by hand.

## Limits

| Limit | Value |
| --- | --- |
| File size | 30 MB |
| Formats | PDF, Word (`.docx`) |

A photograph or a scan has to be saved as a PDF first. The panel refuses a `.doc` file. Save it as
`.docx` first.

The route is `POST /api/import`, signed-in sessions only, and it needs `ANTHROPIC_API_KEY` on the
server. `GET /api/import` reports whether the key is set. Without it the panel reports that order
import is not enabled.

A declined document gets the advice to enter the pieces by hand. A rate limit gets the advice to
retry shortly. Any other failure to read, or an answer that cannot be parsed, gets the advice to retry
or to enter the pieces by hand. The panel is a way to save typing, never the only way to build a
quote.

## Reading the Word document

`utils/import/docx.ts` reads `word/document.xml` out of the ZIP with `zlib` and strips the tags.
There is no ZIP dependency because one entry from one archive is about forty lines, and ZIP64 is not
handled because a Word document that needed it would be over 4 GB.

## Tests

```bash
npm test
```

`utils/import/import.test.ts` builds a ZIP byte by byte and reads it back, parses a cut list written
with different dashes and separators, and measures the notched piece above to prove the outline beats
the bounding box. `utils/quote-draft.test.ts` checks that a piece goes on the quote as a cut-glass
line at cost. The model calls are not covered: they need a key, and asserting on what a model
returns tests the model rather than this code.
