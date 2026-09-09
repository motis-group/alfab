# Awning costing

The Awning Costing page (`/glass/awnings`) prices a wind-out awning window the way the
fabricator's Excel awning sheet did. The sheet is kept at
`projects/costing/discovery/AWNING COSTING Feb 16 20201.xlsx` for re-verification.

An awning is one product, not a range: the sheet has a single parts list and no window type to
choose. That is the whole difference in shape from the window costing at `/glass/windows`, which
carries nine recipes. Both feed the same purchase orders.

| Part | Location |
| --- | --- |
| Engine (pure functions) | `utils/awning-costing.ts` |
| Rate defaults, rates type, merge | `utils/awning-costing-rates.ts` |
| Saved rates (DB row) | table `awning_costing_rates`, row `default`, via `utils/awning-costing-store.ts` |
| Rates editor | `/settings/awnings` (`pricing:write` to save; every role can read) |
| Costing page | `app/glass/awnings/page.tsx` |
| Printed sheet | `components/AwningCostingSheet.tsx`, print styles shared with the window sheet |
| Saved costings | `utils/awning-quote-store.ts`, table `quotes`, rows marked `kind: awning` |
| Golden checks | `utils/awning-costing.test.ts` (`npm test`) |

The golden check is the sheet's own worked example: 1220 x 1100 glass, six off, Super Grey
toughened, banded, flat polished, with a flyscreen, at $1,566.77 each. Every cost line in that
check names the cell it came from. A change that moves any price fails it.

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

## Working with a costing

- **Batch price.** The sidebar prices the same awning at runs of 1, 2, 5 and 10. Setup minutes
  divide across the run, so the price for each falls as the run grows.
- **Quote with several awnings.** Add each costed awning to the quote. The quote creates one
  purchase order line per awning, and prints one sheet per awning.
- **Printing.** "Print Quote For Customer" carries the specification and the price only. "Print
  Costing Sheet (internal)" adds every cost line, the rates used, the labour minutes and the
  margin. The screen copy is the customer one, so a browser Cmd+P prints the safe document.
- **Copying.** "Copy Prices For Customer" is the same split in text. "Copy Cost Build-up
  (internal)" carries the build-up and is marked as not for a customer.
- **Saved costings.** A saved costing keeps the awning, the customer and the price. Load it to
  price the same awning again. **Compare** shows what was quoted, what it costs on today's rates,
  and what it recomputes to on the rates that priced it.
- **Not priced.** Each line with no rate links to its own field in the rates editor.

## Rates

`DEFAULT_AWNING_RATES` holds the sheet's numbers. The editor writes the whole document to the DB
row; `mergeAwningRates` overlays it on the defaults, so keys added later keep their default and
unknown keys are dropped. A blank on a rate that has a default price falls back to that default: a
blank reaches arithmetic as zero and would quote the job short without saying so. Only rates that
are blank by default stay blank.

Saving keeps the document it replaced as an archive row, `v-<the stamp it replaced>`, so an old
price can be reproduced. That behaviour is one implementation, `utils/rates-store.ts`, shared with
the window and glass rates. It depends on the `set_updated_at` trigger; see
[window-costing.md](window-costing.md) for what breaks without it.

### Which rates are wrong

**Yellow, not priced.** The sheet never held this price. Today that is clear and grey toughened
glass. The costing charges the line as nil and says so, rather than quoting them off the Super Grey
price.

**Red, fix before saving.** A value that makes every quote wrong without saying so: a blank or zero
on the labour rate, the per-awning minutes, the margin, or either fixed quantity; any value below
zero; or a margin above 1, which is a percentage typed as a whole number. Saving is blocked while a
red field is present.

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
- Labour is $75 an hour. The window costing uses $85.
- There is no minimum glass area. The window costing floors it at 0.1 or 0.2 sqm by type.

The first three are in [awning-costing-decisions.md](../../discovery/awning-costing-decisions.md).
The labour rate, the missing minimum and the rounding are in
[pricing-currency-decisions.md](../../discovery/pricing-currency-decisions.md), because they are
disagreements with the window costing rather than facts about awnings. Until they are answered, the
sheet's own numbers stand.

Whether the awning labour estimate of 330 minutes is true is now measurable; see
[feedback-loops.md](feedback-loops.md).
