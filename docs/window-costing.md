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
| Golden checks | `utils/window-costing.test.ts` (`npm test`) |

## Inputs

Shared by every window type: height and length (mm), quantity made to size (square) and
quantity shaped (off square), finish (mill, etch, black, etch with black as an extra, powder
coat), trims (none, required, as an extra), development labour on/off, sundry labour minutes,
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
   is a flat $/m; black anodising has no rate in the source and shows as not priced.
4. Glazing: glass area × $/sqm, plus holes, c/view holes, shape cuts, flat-smooth (rough arris
   for laminate) and flat-ground metres at the rate of the glass group. Prices flagged
   `loaded` carry the glass loading (20%, 15% under Marine Window Service).
5. `subtotal = materials + labour + glazing`; `margin = subtotal × margin rate`; packing
   `= round1(glassArea × 2.5)` (AFB008: flat $2). A reinforcing bar, mullion or transom block
   replaces packing with `per-bar cost × count`, as in the sheet.
6. Price `= (subtotal + margin + packing) × (2 if per pair) × (1 + uplift)`; uplift is 7.5%
   (T4633: 10%).
7. Extras, each scaled for pairs and uplifted the same way: trims as an extra (trim
   materials + trim labour, with margin), black anodising as an extra (black cost minus the
   etch line, with margin; not priced until a black rate exists), second-choice glazing (the
   difference between the two glazing blocks, with margin).

Marine Window Service lowers the margin to 22.5% for T5836, T8610 and sash & frame only, and
the glass loading to 15% for every type.

## Rates

`DEFAULT_WINDOW_RATES` holds the sheet's numbers. The editor writes the whole document to the
DB row; `mergeWindowRates` overlays it on the defaults, so keys added later keep their default
and unknown keys are dropped. A blank value means not priced: the line costs $0 and the page
warns. Items the source sheet could not price: black anodising, 015-03 flat and 015-07
medium stays, keeper saddles (sash & frame), laminate c/view holes.

## Source behaviour kept on purpose

These reproduce the sheet and will surprise anyone expecting the obvious formula:

- U6567 welding minutes equal the weld count; its welding table is unused.
- T8610 trim minutes have no area term; sash & frame development has no area term.
- T5836 without a sill flat gets a labour credit (negative sill-flat minutes).
- T4633 and AFB037 both use the T4633 extrusion and anodising rates; the T2482 trim angle
  uses the T5574 rate.
- AFB008 sill flat anodising uses the etch rate for etch finish and the black rate for every
  other finish.
- The T-section sash & frame anodises both frames at the U6567 factor whichever hopper
  series is chosen.
- Reinforcement and mullion blocks price mill finish at $0 (the sheet charged etch).
