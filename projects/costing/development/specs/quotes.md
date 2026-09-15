# A quote for a job

A quote for a job holds lines of every kind: windows, awnings and cut glass. Its page is
`/glass/quotes/<id>`. "New Quote" on the quote list at `/glass` opens `/glass/quotes/new`.

| Part | Location |
| --- | --- |
| Quote page | `app/glass/quotes/[id]/page.tsx` |
| Row shape, margin and totals | `utils/quote-store.ts` |
| The draft during a trip to a calculator, and lines from a customer's order | `utils/quote-draft.ts` |
| Handover between the quote and a calculator | `utils/line-editing.ts` |
| A calculator with no line to price | `components/page/NoLineToPrice.tsx` |
| The customer's copy | `components/PrintedQuote.tsx` |
| Checks | `utils/quote-store.test.ts`, `utils/quote-draft.test.ts` |

## Lines

The operator adds a line and picks its kind. The calculator for that kind prices the line, and the
line comes back to the quote. Edit sends a line to its calculator again. The quote waits in session
storage during the trip.

A calculator prices only a line that a quote or an order sends. The calculator keeps no quote of its
own, so it does not name, save, print or convert a quote. A calculator that opens with no line prices
nothing and shows the way to a new quote. The navigation therefore has no calculator section.

While a calculator prices a line, its toolbar offers only Save To Quote and Cancel. For a line of an
order, Save To Order replaces Save To Quote.

"Read a customer's order" on the quote page reads an order from a PDF or a Word document. Each ticked
piece becomes a cut-glass line at cost. See [order-import.md](order-import.md).

The page lists the first 10 lines, and a button shows the rest. A line after the first 10 that comes
back from its calculator opens the full list, so the operator sees its price. Lines from a customer's
order open the full list in the same way.

## Margin

The quote has one margin, in percent on cost. The margin is a markup: 20 percent prices a $100 cost
at $120. The margin prices every line that has a cost, and a change to it prices those lines again.

A new quote starts at 20 percent, the markup that the glass calculator starts at. The awning rates
carry a 40 percent margin, and the window rates carry 35 or 40 percent by type. A window or awning
line at 20 percent is therefore cheaper than the rates alone make it.

A calculator prices a quote line at cost:

- The glass calculator applies no markup and hides its markup field. A manual price is a manual
  cost.
- The window and awning calculators set every margin rate to zero, the Marine Window Service
  margin included. Packing and uplift stay in the window cost, so the margin applies to them too.

The quote stores the cost of each line and each extra, and the price at the margin. The page
rounds a price to the cent, so the unit price times the quantity is the printed amount.

## The customer's copy

The paper shows prices only. It shows no cost and no margin. An order made from the quote gets the
prices. A glass line on the order carries the margin as its markup.

The layout of the paper follows an invoice: the issuer, the customer, one row for each line, and a
totals block with GST. The type is Berkeley Mono, served from `public/fonts`.

The reference is `Q-` and the first eight hex digits of the row id, such as `Q-3F2A9C1E`. The quote
list and the quote page show the same reference, so a customer can quote it back. Two quotes can
share a reference, but the chance stays under 1% until about 9,000 quotes. A quote with no save
prints "Draft, not issued" in place of the reference.

The footer promises a 30-day price hold from the quote date. After the hold, an unanswered quote
reads as expired, as [feedback-loops.md](feedback-loops.md) describes.

## Lines at their own margin

A line with no cost keeps its price, which already holds the margin of its calculator. Two examples
are a line of a quote that a calculator wrote, and a line of a quote whose row stores no costs. The
margin of the quote does not change that price. The page marks the line and totals it apart. Edit the
line to price it at cost.

## Customer

Pick the customer from the list. For a customer who is not on file, type the name. The name prints
on the quote. "Add To Customers" puts the typed name on the customer list and on the quote. If the
list has a customer with that name, the button picks that customer. Adding a customer needs the
`master_data:write` permission, which the standard role does not have. Contact details go on the
customers page at `/glass/clients`.
