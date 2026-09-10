# Reading a customer's order

Customers send glass orders as a typed cut list or as a drawing, often handwritten. The panel
**Read a customer's order** on `/glass/quote` takes either as a PDF or a Word document, reads every
piece out of it, prices each one with the glass calculator, and shows them for the estimator to
check before any of them goes on the quote.

It is the counterpart of the CAD import in [cad-import.md](cad-import.md), which reads one exact
outline out of a drawing file. This reads a whole order out of a document that was never meant for a
machine, and is never trusted the way a DXF is.

## Code reads what is exact, the model reads what needs judgement

A cut list is a column of numbers. `readCutList` parses it with a regular expression: 43 sizes come
back as 43 sizes, and a line that does not parse is reported rather than dropped. A model asked to
copy the same column can drop one line and say nothing, which is a wrong quote nobody can see.

The model is asked only what the words mean. In the header `6mm Supergrey, toughened polished edges,
NO stamps, Delivery to Eildon` there is one thickness, one glass type and one edge finish the
calculator holds, and three things it does not. The model maps the first three onto the calculator's
options and puts the rest in warnings.

A handwritten drawing has no exact half, so the model reads all of it and every piece is marked
**check against the drawing** in the review table.

## A sketched shape is priced by the CAD pipeline

For a piece that is not a rectangle the model returns the outline as points in millimetres.
`applySketchToSpec` writes those points as an SVG at 1:1 and sends it through `parseCadDocument`,
`analyzeCadDocument` and `buildCadOutline` — the same path a DXF takes.

A shape read off a sketch is therefore classified, measured and priced by the same code as the same
shape imported from a CAD file, and cannot disagree with it. It also means the shape charge, the
curved-edgework switch, radius corners and hole counting all apply without being written twice.

This matters most where a bounding box is wrong. The notched piece on the Status Houseboats sketch
measures 0.700 m² against a 317 x 2308 bounding box of 0.732 m². Pricing the box overcharges the
customer by 4.5% on that piece.

## What the estimator sees

One row per piece: the size, the shape, the measured area where one was taken, the quantity, and
what the piece costs at the shop's own rates. Rows are ticked by default and can be unticked;
quantities can be corrected in place. **Add To Quote** puts the ticked rows on the quote at the
markup showing on the form, as separate pieces that behave like any other — each can be opened back
into the form to be changed.

Warnings sit above the table, and nothing is hidden inside a row:

- a treatment the calculator cannot price, toughening among them
- a line that looks like a size but did not parse
- a glass and thickness the shop does not stock, and what was used instead
- anything the model could not read off the drawing

## Toughening is not a field

`GlassSpecification` has no toughening flag, and both the Status Houseboats documents ask for
toughened glass on every piece. Either the 6 mm Super Grey rate already means toughened or the whole
job prices short. Until that is settled the import reports it as a warning on every order that asks
for it, and the estimator prices it by hand. See
[pricing-currency-decisions.md](../../discovery/pricing-currency-decisions.md).

## Limits

| Limit | Value |
| --- | --- |
| File size | 30 MB |
| Formats | PDF, Word (`.docx`) |
| Pages | 100 per PDF |

A photograph or a scan has to be saved as a PDF first. A `.doc` from a version of Word older than
2007 is not a ZIP and is refused; Word saves one as `.docx` without changing the content.

The route is `POST /api/import`, signed-in sessions only, and it needs `ANTHROPIC_API_KEY` on the
server. `GET /api/import` reports whether the key is set. Without it the panel reports that order
import is not enabled.

A refusal, a rate limit and an unreadable answer each come back with the same advice: enter the
pieces by hand. The panel is a way to save typing, never the only way to build a quote.

## Reading the Word document

`utils/import/docx.ts` reads `word/document.xml` out of the ZIP with `zlib` and strips the tags.
There is no ZIP dependency because one entry from one archive is about forty lines, and ZIP64 is not
handled because a Word document that needed it would be over 4 GB.

## Tests

```bash
npm test
```

`utils/import/import.test.ts` builds a ZIP byte by byte and reads it back, parses a cut list holding
every dash and separator seen in real orders, and measures the notched piece above to prove the
outline beats the bounding box. The model calls are not covered: they need a key, and asserting on
what a model returns tests the model rather than this code.
