# Glass quoting

The glass calculator at `/glass/quote` prices cut glass: a size, a thickness and a type, plus
edgework, holes, shaping, ceramic banding and scanning. It is the counterpart of the window costing
at `/glass/windows`, which prices made-up aluminium windows. Both feed the same purchase orders.

## A quote is a job, not a piece

A quote holds as many pieces as the job has. Price a piece, name it, add it to the quote, price the
next. Each piece keeps its own size, glass, markup and quantity, and becomes one purchase order
line. The quote total is what the customer is told.

A quote can be saved and reopened. A saved quote holds the prices it was given, not today's, so a
customer who rings back a fortnight later gets the same number. It records which glass rates priced
it; reopening a quote priced on rates that have since changed says so.

Saved quotes are rows in `quotes` marked `kind: glass`, alongside window costings marked
`kind: window`. Neither list shows the other's rows.

## Customer

Picked from the customer list, which carries the contact, the phone and the delivery address. A
purchase order made from the quote arrives with that customer already selected. A walk-in is typed
by hand instead, and the order matches it on name where it can.

## Minimum charge

A small piece costs the same to handle, cut and invoice as a large one, but area alone prices a
200 x 200 offcut at a few dollars. Two rates under Settings set the floor:

| Rate | What it does |
| --- | --- |
| Minimum charge per piece | The least a piece is charged, whatever the breakdown comes to |
| Minimum area charged | The smallest area the glass itself is priced at |

Both are zero until the shop sets them, which prices exact area, as the calculator always did. When
a minimum applies, the breakdown shows what it added rather than burying it in the glass line.

## Rates

Glass rates live in `glass_costing_rates`, one JSON document, edited under Settings. Saving keeps
the document it replaced as an archive row, so an old price can be reproduced. A blank never
overwrites a price: it would read as zero and quote the job short.

The rates are company-wide. Before, they lived in each estimator's browser, so two people quoting
the same job could give different numbers and nobody could tell whose were right.

## Three glass price lists

The window and awning rates hold their own glass prices, and they are not the same numbers as these.
**Settings → Price Drift** reports where they disagree and by how much; see
[pricing-health.md](pricing-health.md). Whether a gap is an error is still open: these prices are a
base a per-piece markup is applied to, while the window costing's feed a window that carries margin
and uplift afterwards.
