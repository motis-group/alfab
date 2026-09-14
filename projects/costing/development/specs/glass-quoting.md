# Glass quoting

The glass calculator at `/glass/quote` prices cut glass: a size, a thickness and a type, plus
edgework, holes, shaping, ceramic banding and scanning. It is the counterpart of the window costing
at `/glass/windows`, which prices made-up aluminium windows. Both feed the same purchase orders.

## The calculator's quote

The calculator keeps its own quote of cut-glass pieces. It is separate from a quote for a job, which
[quotes.md](quotes.md) describes.

The quote holds as many pieces as the job has. Price a piece, name it, add it to the quote, price the
next. Each piece keeps its own size, glass and quantity, and becomes one purchase order line. The
markup is set once for the quote, under the quote notes, and prices every piece. A change to it
reprices the whole quote. A piece with a manual unit price keeps that price.

When the calculator opens from an order to price one line, there is no quote around the line, so
the line's own markup field is on the piece. A line of a quote for a job is priced at cost, with no
markup field, because that quote sets the margin. See [quotes.md](quotes.md).

Pieces are priced one at a time, or read off a customer's order in one go; see [order-import.md](order-import.md).

Two actions keep the quote:

- **Save Quote** writes a row in `quotes` marked `kind: glass`. The row holds the prices the quote
  was given, not today's prices, so a customer who calls back later gets the same number. The row
  also holds the stamp of the glass rates that priced it. No page compares that stamp with the
  current rates.
- **Print Quote** saves the quote as a quote for a job, marked `kind: quote`, and prints it with a
  reference.

The quote list at `/glass` shows both rows with the quotes of every other kind. Open on a
`kind: glass` row shows it on the quote page. When the quote has a priced piece, saving it there
rewrites the row as a quote for a job.

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

Both are zero until the shop sets them. At zero, the calculator prices the exact area. When a
minimum applies, the breakdown shows what it added rather than burying it in the glass line.

## Rates

Glass rates live in `glass_costing_rates`, one JSON document, edited under Settings. Saving keeps
the document it replaced as an archive row, so an old price can be reproduced. A blank never
overwrites a price: it would read as zero and quote the job short.

The rates are company-wide, so two estimators who quote the same job give the same price.

## Prices the other lists share

The glass price list also sets the glass, ceramic banding and flat polish prices that the window and
awning rates share. [pricing-health.md](pricing-health.md) lists each shared rate and shows how
**Settings → Price Drift** checks that the lists agree.
