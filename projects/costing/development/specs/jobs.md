# Converting quotes to a purchase order

A boat needs windows, awnings and cut glass. One quote for the job can hold all three kinds of line,
as [quotes.md](quotes.md) describes. A calculator can also save a quote of its own kind. Converting
puts the priced lines of one or more quotes on one purchase order, so the customer gets one order
and one number.

| Part | Location |
| --- | --- |
| Merge, customer rule, warnings and name | `utils/quote-register.ts`, `mergeQuotesForOrder` |
| Tick and convert | `app/glass/page.tsx` |
| Convert one quote from the quote page | `app/glass/quotes/[id]/page.tsx` |
| Order from a calculator | `handleCreatePurchaseOrder` in `app/glass/quote/page.tsx`, `app/glass/windows/page.tsx` and `app/glass/awnings/page.tsx` |
| Draft handover | `utils/quote-to-order.ts` |
| Order side | `app/glass/new/page.tsx`, `applyQuoteDraft` |
| Checks | `utils/quote-register.test.ts`, `utils/customer-quote-store.test.ts`, `utils/quote-to-order.test.ts` |

## Where a quote is converted

The quote list at `/glass` shows every saved quote of every kind. Convert on a row converts that
quote alone. To put several quotes on one order, tick them and click "Convert N To One Order". The
button shows only when the estimator ticks two or more quotes.

The quote page at `/glass/quotes/<id>` has no Convert for a quote it edits. It edits a quote for a
job, and a quote from a calculator that has a line priced above $0. Convert those quotes from the
quote list. The page shows any other quote as its document, and "Convert To Order" in the bar at the
top of the page converts that quote. View on the dashboard at `/glass/dashboard` opens the quote page.

The quote list and the quote page call `mergeQuotesForOrder`, so one quote is a merge of one. Each
page then opens a new order from the draft on `/glass/new`. The estimator checks the order and saves it.
Saving the order links each quote with a priced line to the order, which makes the quote won. See
[feedback-loops.md](feedback-loops.md).

"Create Purchase Order" on the glass, window and awning calculators opens an order from the list on
the calculator. When the list is empty, the order holds the item on screen. It does not call
`mergeQuotesForOrder` and carries no quote id, so the order makes no saved quote won.

A purchase order is an approved quote, so conversion is a deliberate act. A quote does not become an
order by itself.

## One order, one customer

A purchase order carries one customer id and one delivery address. A line has no customer of its own,
so nothing downstream catches one customer's glass on another customer's order. For this reason,
`mergeQuotesForOrder` refuses quotes for different customers.

The rule compares only the quotes that have a priced line:

- It compares names without case or extra spaces, so `Status Houseboats` and `status  houseboats` are
  one customer. It refuses two or more different names, and its reason lists them.
- A quote with a customer id and a quote with only the same name are one customer.
- It refuses two customer records with the same name.
- A quote with no customer name does not count. It joins the customer that the other quotes name.

A glass quote, a window or awning costing, and a quote for a job saved with no customer store the
name `No Client`. That name counts, so the rule refuses such a quote beside a quote for a named
customer.

The quote list checks the ticked quotes each time the selection changes. When the set cannot become
one order, the list shows the reason and offers no Convert button.

The first converted quote with a customer id gives the order its customer. A quote for a job, a glass
quote and a printed customer quote can carry an id. Window and awning costings carry only a name.
When no quote has an id, the order page selects the active customer with the first quote's name, if
exactly one matches. Otherwise, the order notes get `Calculator customer:` and the name.

## Quotes with no priced line

The quote list does not let the estimator tick a quote with no priced line. Its Convert button
reports that there is nothing to put on an order. The quote page shows no "Convert To Order" for it.

`mergeQuotesForOrder` accepts such a quote. It leaves the quote off the draft and returns a warning
that names it. The quote list shows the warnings in its error card and then opens the order page at
once. The order page does not get the warnings.

A printed customer quote can mix priced and unpriced lines. Only the priced lines go on the order, and
no warning names the unpriced lines.

The merge counts a glass piece at $0 as a priced line. Converting a glass quote puts its $0 pieces on
the order at $0. When every piece is at $0, the quote page shows the quote as its document, with
"Convert To Order".

## The order's name

Each quote gives a label: its reference, then its name, such as `Q-3F2A9C1E Smith residence`. A quote
for a job and a printed customer quote have a reference. A glass quote and a window or awning costing
have none. One quote gives the draft its label. Several quotes give their labels joined with ` + `,
such as `Q-3F2A9C1E Smith residence + Kitchen hopper`.

A purchase order has no name field. The order page writes the name into the line descriptions:

- A window or awning line reads as the name, then ` | `, then the line's own description.
- A glass line starts with the name of the piece. It uses the draft's name only when the piece has none.

On an order made from several quotes, each window and awning line carries every label, not only the
label of its own quote. The order row stores no link to its quotes. Saving the order writes the link
on each quote instead, in `quotes.purchase_order_id`.

## What else the draft carries

- **Lines.** Every priced line of every quote. The order page lists glass lines first, then windows,
  then awnings.
- **Rates.** Window and awning lines keep the stamp of the rates that priced them. A glass line keeps
  its own markup.
- **Notes.** The notes of each quote, without blanks and without repeats. They become the order notes.
- **Date.** The date of the first priced quote becomes the order's received date. The quote list sorts
  newest first, so from the list that is the newest quote ticked.

## Handover to the order page

`persistQuoteToOrderDraft` writes the draft to session storage under `adhocQuoteToPurchaseOrderDraft`.
On `/glass/new?fromQuote=1`, `consumeQuoteToOrderDraft` reads the draft once and removes it. It drops
any line whose costing spec it does not recognize.
