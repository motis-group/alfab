# Glass quoting

The glass calculator at `/glass/quote` prices cut glass: a size, a thickness and a type, plus
edgework, holes, shaping, ceramic banding and scanning. It is the counterpart of the window costing
at `/glass/windows`, which prices made-up aluminium windows. Both feed the same purchase orders.

## A line of a quote or an order

The calculator prices one cut-glass line that a quote or an order sends, as [quotes.md](quotes.md)
describes. It keeps no quote of its own.

A line of a quote is priced at cost, with no markup field, because the quote sets the margin. A line
of an order has no quote around it, so the markup field is on the line.

A drawing measures the line in the calculator. See [cad-import.md](cad-import.md). A customer's order
goes on the quote page, one line for each piece. See [order-import.md](order-import.md).

## Glass quotes in the quote list

The quotes table can hold rows marked `kind: glass`, and no page writes them. A row holds the prices
that the quote was given, not today's prices, so a customer who calls back later gets the same
number. The row also holds the stamp of the glass rates that priced it. No page compares that stamp
with the current rates.

The quote list at `/glass` shows these rows with the quotes of every other kind. Open on a
`kind: glass` row shows it on the quote page. When the quote has a piece priced above $0, saving it
there rewrites the row as a quote for a job. A piece at $0 has no price, so it stays off the quote
page and off any order made from the quote.

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
