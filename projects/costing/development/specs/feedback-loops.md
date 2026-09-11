# Feedback loops

The costing app could price a job and never learn anything from what happened next. A quote was
written, printed and forgotten; a job was made and nobody compared the hours it took against the
hours it was costed at. Both estimates could only age.

Two fields close that. Neither is worth anything on its own, and both only pay off if they get
filled in, which is why each is captured where the user already is rather than on a page of its own.

| Part | Location |
| --- | --- |
| Quote outcome, win rate, loss reasons | `utils/quote-status.ts` |
| Outcome control and win-rate card | `components/QuoteStatusControl.tsx` |
| Estimate against actual | `utils/estimate-accuracy.ts`, `utils/estimate-accuracy-store.ts` |
| Accuracy card | `components/EstimateAccuracyCard.tsx` |
| Checks | `utils/quote-status.test.ts`, `utils/estimate-accuracy.test.ts` |

## Did the quote win

`quotes` carries `status` (`open`, `won`, `lost`, `expired`), `status_reason` and
`status_changed_at`. Every saved quote of every kind is a row in that table, so one field serves the
glass, window and awning lists alike.

A quote is marked from the list it already appears on, two clicks. Marking it lost asks why, from a
short list: Price, Lead time, No response, Went elsewhere, Job cancelled, Other. A free-text box
gets left empty, and an empty reason cannot tell anyone whether the shop is losing on price or on
lead time.

An open quote expires by itself the day after its 30-day price hold runs out, counted from the
quote date. A quote set back to open by hand starts a new 30 days from that day. Won and lost quotes
never expire. `effectiveQuoteStatus` in `utils/quote-status.ts` applies the rule when
`listQuoteRecords` reads the quotes, so every list and card shows the same status.

The rule is computed and never written. The stored status of an expired quote stays `open`, so
SQL that reads `quotes.status` directly shows it as open unless it applies the same rule. Nothing
runs on a schedule, so there is no job that can stop running.

The win rate is won over **decided** quotes. Open and expired quotes are counted and shown but kept
out of the rate: a quote nobody has answered is not a loss. Value won and value lost are totalled
beside it, over the quotes that carry a price.

When Price is the commonest reason given, the card says so. That is the signal the margin is set too
high, and it is the first time the app has been able to produce it.

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
