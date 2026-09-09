# Awning costing: what the sheet does not say

The awning calculator at `/glass/awnings` reproduces `AWNING COSTING Feb 16 20201.xlsx` exactly,
including the parts of it that look like mistakes. Nothing below changes a price until it is
answered. Reply with the item numbers.

The model itself is in
[development/specs/awning-costing.md](../development/specs/awning-costing.md).

## 1. Numbers that disagree with themselves

| # | Question |
| --- | --- |
| 1.1 | The winder is $52 in the costing and $38.50 in the sheet's own parts list, which is the same figure as the hinges directly under it. $52 is what the sheet charged and is what the calculator uses. Is $52 the right price, or did the parts list stop being updated? |
| 1.2 | The parts list is headed "PARTS LIST & COST + 10%", but no formula adds ten percent anywhere. The calculator treats the ten percent as already inside the listed prices. Is that right, or has every awning been quoted ten percent light since 2020? |
| 1.3 | The flyscreen line says "Selling Price" and still sits inside the cost the 40 percent margin is taken on, so it is marked up twice: $75 becomes $105 on the quote. Deliberate, or should the flyscreen be added after the margin? |

## 2. Prices the sheet never held

| # | Question |
| --- | --- |
| 2.1 | The sheet quotes Super Grey toughened only, at $198 per square metre. Clear and grey toughened are on the menu and cannot be picked until you give a price. What are they? |
| 2.2 | Are there other awning glasses, or is Super Grey the whole range? |

## 3. Where the awning and the window disagree

Both sheets price the same shop, and these three differ. Each is a separate question because each
could be right.

| # | Question |
| --- | --- |
| 3.1 | Labour is $75 an hour on the awning sheet and $85 on the window sheet. Is awning labour genuinely cheaper, or is $75 a 2020 rate that was never carried across? |
| 3.2 | The window costing floors the glass area at 0.1 or 0.2 square metres by type, so a small pane is not priced at a few dollars. The awning sheet has no floor. Should it? |
| 3.3 | The window costing rounds glass area to two decimal places; the awning sheet does not. Kept as each sheet had it, so the same pane prices a few dollars apart between the two pages. Which is correct? |

## 4. Things the sheet fixed that may not be fixed

| # | Question |
| --- | --- |
| 4.1 | Anchor plate is 1.2 metres on every awning, whatever the size. Is that right for a 600 mm awning and a 1800 mm one alike? |
| 4.2 | Fixings are 20 sets on every awning, same question. |
| 4.3 | Setup is 60 minutes per run and 330 minutes per awning. Both are from 2020. Still right? |
| 4.4 | Banding is a set price whatever the size, and the calculator lets it be turned off. Is banding ever not wanted? |

## 5. Scope

| # | Question |
| --- | --- |
| 5.1 | Is there more than one awning, the way the 035 hopper turned out to have a basic version and one with gas struts? One parts list is all the sheet holds. |
| 5.2 | The sheet's header says "Type Customer / boat Name Here", so these are marine. Do land awnings price differently? |
| 5.3 | The window costing has a Marine Window Service flag that lowers the margin and the glass loading. The awning sheet has no such thing. Does MWS apply to awnings? |

## 6. Built without your input

These are in the app now. None of them changes a price.

- The sheet's example awning, 1220 x 1100 at six off, priced by the app to the cent: $1,566.77.
- Price per each at runs of 1, 2, 5 and 10, beside the price.
- A printed quote for the customer and a printed costing sheet for Alfab, one page per awning.
- One quote with several awnings, which creates one purchase order line per awning.
- Saved costings, which double as templates for a repeat customer, and a comparison of what was
  quoted against today's rates and against the rates that priced it.
- Company-wide rates, editable under Settings, with the replaced list kept so an old price can be
  reproduced. Before this the awning price list was a spreadsheet on one machine.
- A link from each "not priced" line straight to its rate field.
- Hand-checked test cases against the sheet's own cells.
