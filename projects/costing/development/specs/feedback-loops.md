# Feedback loops

The costing app could price a job and never learn anything from what happened next. A quote was
written, printed and forgotten; a job was made and nobody compared the hours it took against the
hours it was costed at. Both estimates could only age.

Two records close that. A quote's outcome comes from what the shop does anyway, converting it to
an order. The minutes a job took are typed on the order line when the job is done.

| Part | Location |
| --- | --- |
| Quote outcome and win rate | `utils/quote-status.ts` |
| Win-rate card | `app/glass/dashboard/page.tsx` |
| Estimate against actual | `utils/estimate-accuracy.ts`, `utils/estimate-accuracy-store.ts` |
| Accuracy card | `components/EstimateAccuracyCard.tsx` |
| Checks | `utils/quote-status.test.ts`, `utils/estimate-accuracy.test.ts` |

## Did the quote win

Nobody marks a quote. Its status is read from what happened to it:

- **Won** when it has a purchase order. `quotes.purchase_order_id` links the two. Convert carries the
  quote ids to the order page, and saving the order writes the link. An order that is never saved
  wins nothing.
- **Expired** the day after its 30-day price hold runs out, counted from the quote date, with no
  order made.
- **Open** until then.

Deleting an order sets the link to null, so its quotes go back to open. `effectiveQuoteStatus` in
`utils/quote-status.ts` applies the rule when `listQuoteRecords` reads the quotes, so every list and
card shows the same status.

The status is computed and never written. `quotes.status` holds only what was set by hand before
the rule existed. There, `lost` and `expired` both read as expired, and `won` with no order reads as
open.
SQL that reads `quotes.status` directly has to apply the same rule. Nothing runs on a schedule, so
there is no job that can stop running.

The win rate is won over quotes that have run their course: won / (won + expired). An open quote is
still in play, so it is counted but kept out of the rate. Value won is totalled beside it, over the
quotes that carry a price. Nothing records why a quote was not won.

A quote can be deleted from the order list unless it is won. A won quote is refused, in the page and
in `/api/db`, because it is the record of what its order was sold at. Deleting the order first
returns it to open. Deleting a printed quote leaves the customer holding a number that points at
nothing, and the confirmation says so.

## Was the estimate true

`purchase_order_lines` carries `actual_minutes`: the minutes the line really took, for the whole
line rather than per unit. It is typed on the order line when the job is done.

An order can be deleted only while it is open or cancelled and records no work: no quantity made and
no minutes. Deleting it takes its lines with it, so `orderDeleteRefusal` in
`utils/order-management.ts` refuses any other order. The order list offers Archive for those, which
hides the order and can be undone.

`measureAccuracy` recomputes what the costing predicted for each measured line and reports the ratio
by product type. The estimate is the per-unit minutes multiplied back up by the line quantity, since
the costing already divides setup across the run.

Estimates are recomputed on **today's** rates, not the rates that priced the job. The labour minute
tables are the thing under test, so measuring against the current table is what says whether the
current table is right.

A line with no recorded minutes, or no costing spec, is skipped. An unmeasured shop reports as
unmeasured, never as on time. The ratio is weighted by minutes, so a ten-off job counts for more
than a one-off. A gap under 10 percent reads as the estimate holding up.

The result is shown on the rates editors, beside the labour minutes that would change it, together
with what the per-unit minutes would have to be for the estimate to have matched. Measuring it
anywhere else would leave somebody to carry the number across.

Why this matters most for awnings: labour is $425 of an awning's $1,119 cost, and the 330 minutes it
is costed at came off a 2020 sheet that nothing has ever checked.
