# Window costing

The Window Costing page (`/glass/windows`) prices aluminium-framed windows the way the
fabricator's Lotus 1-2-3 costing sheet did. The sheet is kept at
`docs/legacy/WINDOWS.12M` for re-verification. The port uses the Victorian costing basis
only; the Queensland branch of the sheet is not implemented (`state` is fixed to `VIC`).

| Part | Location |
| --- | --- |
| Engine (pure functions) | `utils/window-costing.ts` |
| Rate defaults, rates type, merge | `utils/window-costing-rates.ts` |
| Saved rates (DB row) | table `window_costing_rates`, row `default`, via `utils/window-costing-store.ts` |
| Rates editor | `/settings/windows` (`pricing:write` to save; every role can read) |
| Costing page | `app/glass/windows/page.tsx` |
| Printed sheet | `components/WindowCostingSheet.tsx`, print styles in `global.scss` |
| Rate severity | `utils/window-rate-health.ts` |
| Glossary | `utils/window-costing-glossary.ts`, shown by `components/WindowCostingGlossary.tsx` |
| Saved costings | `utils/window-quote-store.ts`, table `quotes` |
| Golden checks | `utils/window-costing.test.ts` (`npm test`) |

Every window type has a golden check: a window worked by hand from the sheet's own formulas.
A change that moves any price fails those checks.

## The menu

`utils/window-catalogue.ts` holds the menu the workshop picks from: a series, then the window in it.
The costing engine names its nine recipes by extrusion code, because the legacy sheet did. Nobody
orders a T4633; they order a 650 series slider.

| Series | Windows |
| --- | --- |
| 1000 | 015/008 slider, 6567 fixed, 035 hopper (no recipe) |
| 750 | 5573 fixed, 003 slider |
| 650 | 037 slider |
| 500 | 5573 fixed, 5836 slider, 4633 slider for horse floats, 023 fixed horse float front (no recipe) |
| Other, off the menu | 8610 flat sash, 2482 caravan, T section sash and frame, sash and frame |

One recipe can serve several series: 5573 is the fixed window in both the 750 and the 500. A product
carries the recipe and, where the recipe has two sections, which section to use, so the 650 slider is
the AFB037 section of the T4633 recipe and the 500 horse float slider is the T4633 section of it.

A product with no recipe is listed and disabled, so the menu shows the whole range and says which
parts of it cannot be priced.

A retired series is off the menu but still priced. Those four windows are not made any more, so the
picker hides them, while the recipes and their golden checks stay. A costing saved against one still
opens, and its series reappears in the picker while it is open. Bringing one back means clearing one
flag in `utils/window-catalogue.ts`. The costing records the product it was priced as, so a saved costing
and a purchase order line read as a series and a window rather than an extrusion code.

## Inputs

Shared by every window type: height and length (mm), quantity made to size (square) and
quantity shaped (off square), finish (mill, natural anodised, powder coat), trims (none,
required, as an extra, on the types that take a trim), development labour on/off, sundry labour minutes,
Marine Window Service flag, glazing material, optional second-choice glazing, and for most
types the glazing extras (holes, c/view holes, flat-smooth metres, flat-ground metres for
laminate).

Type-specific inputs (`WINDOW_TYPES[type].fields`):

| Type | Inputs |
| --- | --- |
| T5573 hopper | pairs, welds, reinforcing bar or mullion + count |
| T5836 slider (600) | pairs, sill flat, lock type, locks, welded corners, transoms or mullions + count |
| T4633 / AFB037 slider | pairs, section, wipe bars (none, single, double), lock type, locks, slider stop |
| T8610 flat sash | pairs (default on) |
| T2482 caravan | pairs, welds |
| U6567 (1000 series) | pairs, welds (default 1), reinforcing bar or mullion + count; warns below 6 mm glass |
| AFB008 / AFB003 slider | pairs, section, sill flat, locks, welds, transoms or mullions + count, Riviera mullion |
| T-section sash & frame | hinges, pairs of stays + stay type, bolt sets, hopper series, welds |
| Sash & frame | pairs of caravan stays |

T5836, T4633 and AFB008 derive holes, shape cuts and flat-smooth metres from the locks and
mullions, so those extras are not entered by hand.

## Formula chain

1. Perimeter `P = 2 (H + L) / 1000` m. Area `A = round2(H L / 1e6)`; T4633 uses `L + 35`
   unless double wipe bars. Glass area `= max(A, minimum)` with a minimum of 0.1 or 0.2 sqm
   per type. `qty = to size + shaped`; the window is square when to size > shaped.
2. Labour minutes. Window `= setup / qty + each + glassArea × perSqm` from the type's square
   or off-square table. Development, trim, welding, and the type-specific parts (sill flat,
   fittings, wipe bars, mullions) come from `rates.labour[type]`; `labourParts` on the type
   config lists which parts go into the labour line. Trim minutes count only when trims are
   required; with trims as an extra they move to the extra. Welds over 4 are allowed only on
   shaped windows.
3. Material lines: metres or quantity × rate, in the sheet's order. Extrusion $/m
   `= kg/m × $/kg × (1 + supplier loading) × (1 + offcut)`; bar stock `= bar $ / bar length ×
   (1 + loading) × (1 + offcut)`. Anodising $/m `= etch $/sqm × section factor`, with a
   minimum charge (doubled for the two-frame types); mill finish prices nothing; powder coat
   is a flat $/m.
4. Glazing: glass area × $/sqm, plus holes, c/view holes, shape cuts, flat-smooth (rough arris
   for laminate) and flat-ground metres at the rate of the glass group. Prices flagged
   `loaded` carry the glass loading (20%, 15% under Marine Window Service).
5. `subtotal = materials + labour + glazing`; `margin = subtotal × margin rate`; packing
   `= round1(glassArea × 2.5)` (AFB008: flat $2). A reinforcing bar, mullion or transom block
   replaces packing with `per-bar cost × count`, as in the sheet.
6. Price `= (subtotal + margin + packing) × (2 if per pair) × (1 + uplift)`; uplift is 7.5%
   (T4633: 10%).
7. Extras, each scaled for pairs and uplifted the same way: trims as an extra (trim
   materials + trim labour, with margin), second-choice glazing (the difference between the
   two glazing blocks, with margin).

Marine Window Service lowers the margin to 22.5% for T5836, T8610 and sash & frame only, and
the glass loading to 15% for every type.

## Working with a costing

- **Batch price.** The sidebar prices the same window at batches of 1, 2, 5 and 10. Setup and
  development minutes divide across the batch, so the price per window falls as the run grows.
- **Quote with several windows.** Add each costed window to the quote. The quote creates one
  purchase order line per window, and prints one sheet per window.
- **Printing.** Two documents print the quote's windows, or the window on screen when the quote
  is empty. "Print Quote For Customer" carries the specification and the price only. "Print
  Costing Sheet (internal)" adds every cost line, the rates used, the labour minutes, margin,
  packing and uplift. The app hides itself for the printer; only the sheet prints.
- **Copying.** "Copy Prices For Customer" is the same split in text. "Copy Cost Build-up
  (internal)" carries the build-up and is marked as not for a customer.
- **Customer.** Picked from the customer list, so the purchase order does not have to match one by
  name. A walk-in is still typed by hand and matched on the way through.
- **Saved costings.** A saved costing keeps the window, the customer and the price. Load it to
  price the same window again, which makes it the template for a repeat customer. Saved costings
  are rows in `quotes` marked `kind: window`.
- **Not priced.** Each line with no rate links to its own field in the rates editor.

## Rates

`DEFAULT_WINDOW_RATES` holds the sheet's numbers. The editor writes the whole document to the
DB row; `mergeWindowRates` overlays it on the defaults, so keys added later keep their default
and unknown keys are dropped. A blank value means not priced: the line costs $0 and the page
warns. Items the source sheet could not price: 015-03 flat and 015-07 medium stays, keeper
saddles (sash & frame), laminate c/view holes.

Recipes reference rates by key, and those keys are unions derived from the defaults
(`ExtrusionCode`, `PerMetreKey`, `EachKey`, `AnodCode`, `TrimCode`). Renaming a rate now fails the
typecheck at every call site instead of silently leaving a line unpriced.

### Which rates are wrong

A rate can be blank for two very different reasons, and the editor colours them apart.

**Yellow, not priced.** The legacy sheet never held this price: flat and medium stays, keeper
saddles, and laminate c/view holes. The costing charges the line as nil and says so.
The quote is short by whatever the item really costs.

**Red, fix before saving.** A value that makes every quote wrong without saying so:

- A rate that had a price, left blank. JavaScript reads the blank as zero once the value reaches
  arithmetic, so the quote still prints a confident price. Blanking the hourly labour rate takes 38
  to 56 percent off, silently.
- Zero on a rate the whole costing leans on: the labour rate, a supplier price per kilogram, a glass
  price per square metre, the etch anodising rate. Zero is never reported as not priced.
- A value below zero, which turns a cost line into a credit.
- A fraction above 1, which is a percentage typed as a whole number: 40 instead of 0.4 multiplies
  the price by 41.

Saving is blocked while any red field is present. `mergeWindowRates` is the second guard: a blank on
a rate that has a default price falls back to that default, so an older saved document cannot make a
quote wrong either. Only rates that are blank by default stay blank.

Each section carries the date its prices were last known good. The editor shows the date, a
search box, the unit of every rate, and the resulting price per metre for each extrusion.

## The words the sheet assumed

`utils/window-costing-glossary.ts` defines the terms a new estimator has to be told: margin, uplift,
packing, loading, offcut, minimum charge, made to size against shaped, per pair, development and
sundry labour, the anodising options, Marine Window Service, arris and the edge finishes, c/view
holes, second choice glazing. Both the costing page and the rates editor show it.

The uplift entry says plainly that the sheet never recorded what the charge covers. Keep it that way
until someone confirms it.

## Reproducing an old price

Saving rates keeps the document it replaced as an archive row, `v-<the stamp it replaced>`.
Costings and purchase order lines record the stamp of the rates that priced them. Resetting to the
defaults leaves the archive rows in place.

The archive id is built from `updated_at`, so it depends on the `set_updated_at` trigger on
`window_costing_rates` and `glass_costing_rates`. Apply a table without its trigger and the stamp
never advances: the second save writes an archive id that already exists, the store treats a
duplicate as nothing to do, and every save after the first archives nothing. There is no error,
and the loss only shows up later as a costing that cannot be repriced on the rates that made it.
Both triggers ship in `docs/order-management-schema.sql`; keep them with their tables.

A saved costing stores its priced lines, so reopening one shows what was quoted rather than
repricing it. **Compare** on the saved costings list shows three numbers: what was quoted, what the
same window costs on today's rates, and what it recomputes to on the rates that priced it. The third
comes from the archive row, or from the code defaults when the costing carries no stamp. When the
recomputed figure does not match the quote, the costing itself changed rather than the rates.

## Seeing a rate change before it is saved

The rates editor prices the last twenty saved costings on the current rates and on the edit, and
lists every one that moves, largest first. A move of 10 percent or more is marked. Saved costings are
used rather than the golden windows because the goldens are fixed reference sizes that a glass price
barely moves.

The rates table is keyed by a text id the client sets, which is why `/api/db` lists
`window_costing_rates` in `NATURAL_KEY_TABLES`. Every other table keeps a server-generated id.

## Source behaviour kept on purpose

These reproduce the sheet and will surprise anyone expecting the obvious formula:

- U6567 welding minutes equal the weld count; its welding table is unused.
- T8610 trim minutes have no area term; sash & frame development has no area term.
- T5836 without a sill flat gets a labour credit (negative sill-flat minutes).
- T4633 and AFB037 both use the T4633 extrusion and anodising rates; the T2482 trim angle
  uses the T5574 rate.
- T5836 sill flat (40 x 3) charges the etch trim rate on mill finish. The AFB008 flat charges
  nothing for mill (decision 3.5, settled). The two disagree; 3.13 asks whether to settle the 5836
  the same way.
- The T-section sash & frame anodises both frames at the U6567 factor whichever hopper
  series is chosen.
- Reinforcement and mullion blocks price mill finish at $0 (the sheet charged etch).

## Options a window offers

A window type declares the locks, trims and glass groups it takes. `windowOptions(cfg)` fills in the
defaults for anything left out, and the form, the costing and the description all read it rather
than the raw config.

The T4633 recipe is the one that uses all three. Both its sections, the 650 series 037 and the 500
series 4633 horse float, take no trim and no plunger lock, and only 5 and 6 mm toughened or acrylic
goes in either.

`applyWindowOptions` puts a costing back inside those limits when the product or the type changes,
so the form never holds a lock, trim or glass its own dropdown no longer lists. A costing
saved before a window was narrowed still opens and still prices; the sheet warns that the glass or
the lock does not fit rather than refusing it.
