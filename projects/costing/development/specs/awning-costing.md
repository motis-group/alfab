# Awning costing

The Awning Costing page (`/glass/awnings`) prices a wind-out awning window the way the
fabricator's Excel awning sheet did. The sheet is kept at
`projects/costing/discovery/AWNING COSTING Feb 16 20201.xlsx` for re-verification.

An awning is one product, not a range: the sheet has a single parts list and no window type to
choose. That is the whole difference in shape from the window costing at `/glass/windows`, which
carries ten recipes. Both feed the same purchase orders.

| Part | Location |
| --- | --- |
| Engine (pure functions) | `utils/awning-costing.ts` |
| Rate defaults, rates type, merge | `utils/awning-costing-rates.ts` |
| Saved rates (DB row) | table `awning_costing_rates`, row `default`, via `utils/awning-costing-store.ts` |
| Rates editor | `/settings/awnings` (`pricing:write` to save; every role can read) |
| Costing page | `app/glass/awnings/page.tsx` |
| Printed sheet | `components/AwningCostingSheet.tsx`, print styles shared with the window sheet |
| Saved costings | `utils/awning-quote-store.ts`, table `quotes`, rows marked `kind: awning` |
| Printed quotes | `utils/customer-quote-store.ts`, table `quotes`, rows marked `kind: awning-quote` |
| Golden checks | `utils/awning-costing.test.ts` (`npm test`) |

The golden check is the sheet's own worked example, priced on the transcribed sheet rates: 1220 x
1100 glass, six off, Super Grey toughened, banded, flat polished, with a flyscreen, at $1,566.77 each.
Every cost line in that check names the cell it came from. A change to the engine or to the
transcribed rates that moves any price fails it.

## Inputs

Glass height and width (mm), quantity of that size, glass, ceramic banding on or off, flat polish
on or off, flyscreen on or off, and sundry labour minutes.

Sizes are the glass, not the opening. The frame, the rubber seal, the track infill and the flat
polish are all cut to the glass perimeter.

## Formula chain

1. Perimeter `P = 2 (H + W) / 1000` m. Area `A = H W / 1e6` sqm, unrounded.
2. Labour minutes per awning `= setup / qty + each + sundry`. Setup is 60 minutes, each is 330, so
   a one-off carries 390 minutes and one of six carries 340.
3. Material lines, in the sheet's order: frame, anchor plate and rubber seal, winder, hinges,
   winder mount plate, glass winder plate, fixings, track infill, sealant, glazing, labour, and
   the flyscreen. Frame, rubber seal and track infill are `P x $/m`; anchor plate metres and
   fixing sets are fixed quantities; the rest are one each.
4. Glazing: glass area `x $/sqm`, plus ceramic banding at a set price and flat polish at `P x $/m`.
   The glazing block enters the cost as one line, as it does in the sheet.
5. `cost = every line above`. `margin = cost x margin rate`. `price each = cost + margin`.
   The run total is `price each x qty`.

There is no uplift, no packing, no finish, no trims and no per-pair option: the awning sheet has
none of them.

The calculator prices a line of a quote for a job with the margin at zero, because that quote sets
one margin for all its lines. The price card and the printed costing sheet show the margin only when
its rate is not zero. See [quotes.md](quotes.md).

## Working with a costing

- **Batch price.** The sidebar prices the same awning at runs of 1, 2, 5 and 10. Setup minutes
  divide across the run, so the price for each falls as the run grows.
- **The calculator's list.** "Add Awning To Quote", under the quote lines, adds the costed awning to
  a list on the page, as on the window costing. "Create Purchase Order" makes one order line for each
  awning in the list. See [jobs.md](jobs.md).
- **Printing.** "Costing Sheet (internal)" on the Print menu shows every cost line, the rates used,
  the labour minutes and the margin. It starts a new page for each awning. "Quote For Customer"
  prints the shared customer quote, with one line for each awning. Both documents follow
  [window-costing.md](window-costing.md), which also describes the quote reference and drafts.
- **Copying.** The Copy menu holds the same split in text. "Prices For Customer" copies the prices.
  "Cost Build-up (internal)" carries the build-up and is marked as not for a customer.
- **Saved costings.** "Save Costing" writes the awning, the customer and the price as a row in
  `quotes` marked `kind: awning`. The row shows in the quote list and opens on the quote page, as a
  saved window costing does.
- **Not priced.** Each line with no rate links to its own field in the rates editor.

## Rates

`AWNING_RATES_AS_TRANSCRIBED` holds the sheet's numbers, and the golden check prices on it.
`DEFAULT_AWNING_RATES` is that transcription with the shared rates applied: the Super Grey glass
price, ceramic banding and flat polish from the glass price list, and the labour rate from the window
rates. See [pricing-health.md](pricing-health.md).

The editor writes the whole document to the DB row. `mergeAwningRates` overlays it on the defaults,
so keys added later keep their default and unknown keys are dropped. A blank on a rate that has a
default price falls back to that default: a blank reaches arithmetic as zero and would quote the job
short without saying so. Only rates that are blank by default stay blank.

Saving keeps the document it replaced as an archive row, `v-<the stamp it replaced>`, so an old
price can be reproduced. That behaviour is one implementation, `utils/rates-store.ts`, shared with
the window and glass rates. It depends on the `set_updated_at` trigger; see
[window-costing.md](window-costing.md) for what breaks without it.

### Which rates are wrong

**Yellow, not priced.** The sheet never held this price. That is clear and grey toughened glass. The
costing charges the line as nil and says so, rather than quoting them off the Super Grey price.

**Red, fix before saving.** A value that makes every quote wrong. A blank or zero on the per-awning
minutes, the margin or either fixed quantity does this without saying so. A blank or zero labour
rate is red too. The costing reports labour as not priced when that rate is blank, and gives no
price when it is zero. Red also covers any value below zero, and a margin above 1, which is a
percentage typed as a whole number.

The editor blocks a save while any rate is red. A shared rate shows as read-only, with a link to the
list that sets it. The labour rate is a shared rate, so a red labour rate blocks a save here until
someone fixes it in the window rates.

The editor prices the sheet's own example awning on the current rates and on the edit, so the
effect of a rate change is visible before it is saved.

## Source behaviour kept on purpose

These reproduce the sheet and will surprise anyone expecting the obvious formula:

- The flyscreen line is labelled a selling price and still sits inside the cost the margin is taken
  on, so it is marked up 40 percent a second time.
- The parts list is headed "PARTS LIST & COST + 10%". No formula applies that ten percent, so it is
  already inside the listed numbers.
- The winder costs $52 in the costing and $38.50 in the sheet's own parts list. $52 is what the
  sheet charged and is what the rates hold.
- Glass area is not rounded. The window sheet rounds it to two decimal places; this one does not.
- There is no minimum glass area. The window costing floors it at 0.1 or 0.2 sqm by type.

These are questions 1.1 to 1.3, 3.2 and 3.3 in
[awning-costing-decisions.md](../../discovery/awning-costing-decisions.md). Until the shop answers
them, the sheet's own numbers stand.

The labour rate does not follow the sheet. An awning charges the window labour rate. Question 3.1 in
the same document asks whether awning labour costs less.

[feedback-loops.md](feedback-loops.md) measures whether the awning labour estimate of 330 minutes is
true.
