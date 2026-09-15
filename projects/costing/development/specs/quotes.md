# A quote for a job

A quote for a job holds lines of every kind: windows, awnings and cut glass. Its page is
`/glass/quotes/<id>`. "New Quote" on the quote list at `/glass` opens `/glass/quotes/new`.

| Part | Location |
| --- | --- |
| Quote page | `app/glass/quotes/[id]/page.tsx` |
| Row shape, margin and totals | `utils/quote-store.ts` |
| The draft during a trip to a calculator, and the copy of a reissued quote | `utils/quote-draft.ts` |
| Handover between the quote and a calculator | `utils/line-editing.ts` |
| Checks | `utils/quote-store.test.ts`, `utils/quote-draft.test.ts` |

## Lines

The operator adds a line and picks its kind. The calculator for that kind prices the line, and the
line comes back to the quote. Edit sends a line to its calculator again. The quote waits in session
storage during the trip.

The page lists the first 10 lines, and a button shows the rest. A line after the first 10 that comes
back from its calculator opens the full list, so the operator sees its price.

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
  margin included. The window calculator also sets the uplift to zero. Packing stays in the window
  cost, so the margin applies to packing.

The quote stores the cost of each line and each extra, and the price at the margin. The page
rounds a price to the cent, so the unit price times the quantity is the printed amount.

While a calculator prices a quote line, its toolbar offers only Save To Quote and Cancel. The
other actions of the calculator would carry a cost to a customer. For the same reason, the window
and awning calculators print the internal costing sheet on Cmd+P.

## The customer's copy

The paper shows prices only. It shows no cost and no margin. An order made from the quote gets the
prices. A glass line on the order carries the margin as its markup.

## Lines at their own margin

A line with no cost keeps its price, which already holds the margin of its calculator. Two examples
are a line of a quote that a calculator wrote, and a line of a quote whose row stores no costs. The
margin of the quote does not change that price. The page marks the line and totals it apart. Edit the
line to price it at cost.

A quote printed from the glass calculator stores the cost of each piece on the recommended price.
On the quote page, those pieces follow the margin. A piece with a manual price keeps that price.

## Customer

Pick the customer from the list. For a customer who is not on file, type the name. The name prints
on the quote. "Add To Customers" puts the typed name on the customer list and on the quote. If the
list has a customer with that name, the button picks that customer. Adding a customer needs the
`master_data:write` permission, which the standard role does not have. Contact details go on the
customers page at `/glass/clients`.

## Saved quotes

A quote that a customer orders again can be saved to that customer. Pick the customer from the list,
tick "Save to <customer> to reissue later", and click Save Quote. The box shows only for a customer
on the list, because a walk-in has no saved quotes. The row keeps the flag in
`specification.savedToCustomer`. The quote page saves a quote from a calculator as a quote for a job,
so every saved quote is a quote for a job.

A new quote lists the saved quotes of its customer until the quote has a line. Reissue on that list
copies a saved quote into the new quote. Reissue in the toolbar of a quote opens a new quote that
copies it, saved or not.

The copy has the customer, lines, notes and margin of the saved quote, and the date of today. The
30-day price hold starts again on that date. Each line keeps its price, and a change to the rates
does not change it. Until Save Quote, the page names the quote that the copy came from. Edit a line
to price it on today's rates. Save Quote gives the copy its own number. The saved quote does not
change, and the copy is not saved to the customer.

An unsaved copy stays in the browser tab, so New Quote opens it again. Discard Copy empties the new
quote and keeps the customer, so the saved quotes show again.
