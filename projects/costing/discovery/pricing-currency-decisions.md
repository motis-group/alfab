# Are the prices right?

The three calculators reproduce their source sheets exactly. That was the job, and it is done. It
also means the app is now a very precise machine for prices nobody has checked in years, and it will
keep quoting them confidently until somebody says otherwise.

Everything below is a question, not a change. Nothing has been repriced. Reply with the item numbers.

The app now shows these gaps by itself: rate ages on every costing page, and the disagreements at
**Settings → Price Drift**. See [pricing-health.md](../development/specs/pricing-health.md).

## 1. The one question that matters

| # | Question |
| --- | --- |
| 1.1 | When was a supplier price last checked against an actual invoice? If the answer is "not since the sheets were written", this is a repricing exercise, not a software change, and the rest of this document is how we scope it. |

## 2. Prices nobody has dated in a long time

Ages are against September 2026, taken from the dates the sheets themselves recorded.

| # | Group | Last known good | Age |
| --- | --- | --- | --- |
| 2.1 | Fixings and fittings (windows) | July 2007 | 19 years |
| 2.2 | Anodising, etch | Apr 2010 | 16 years |
| 2.3 | Anodising, powder coat | Mar 2015 | 11 years |
| 2.4 | Awnings — every price | Feb 2020 | 6.5 years |
| 2.5 | Aluminium $/kg, extrusions, rubber, labour | 2021 | 5 years |
| 2.6 | Window glass, margins, packing | never recorded | unknown |
| 2.7 | Glass calculator — every price | never recorded | unknown |

Aluminium roughly doubled between 2020 and 2022. Items 2.1 to 2.3 are small parts, so being wrong on
them costs little per window; 2.5 is the aluminium itself, and being five years out on that is the
expensive one.

## 3. The three lists disagree, and it looks like one event

Same product, different list:

| # | Item | Glass calculator | Window costing | Awning costing |
| --- | --- | --- | --- | --- |
| 3.1 | 6 mm Super Grey toughened | $198.12 | $170.00 | $198.00 |
| 3.2 | 6 mm Clear | $92.47 | $80.00 | — |
| 3.3 | 5 mm Clear | $87.59 | $75.00 | — |
| 3.4 | 8 / 10 / 12 mm Clear | $200.63 / $221.78 / $270.74 | $174.02 / $192.37 / $234.84 | — |
| 3.5 | 5 mm Dark Grey toughened | $128.97 | $110.00 | — |

Window prices above include the 20 percent glass loading where the sheet applies it, so they are
comparable.

Every gap runs the same way, between 13 and 17 percent, and 3.4 is exactly 15.3 percent on all
three. That is not ten items drifting independently. It reads as one list taking a price rise the
other never got.

| # | Question |
| --- | --- |
| 3.6 | Is the window glass figure a **cost in** — what Alfab pays, before the window's own margin and uplift — or a **price out**? The whole comparison depends on the answer and nobody here can give it. |
| 3.7 | If it is a cost in, the two lists are measuring different things and should stay apart, with the reason written down. If it is a price out, the window costing has been quoting glass 15 percent light. |
| 3.8 | Labour is $85 an hour on the window sheet and $75 on the awning sheet. Is awning labour genuinely cheaper, or is $75 a 2020 rate that was never carried across? |

## 4. Margin is not what it says

| # | Question |
| --- | --- |
| 4.1 | The sheets call 0.4 a margin, but it is a markup on cost: cost x 1.4. That is a **28.6 percent gross margin**, not 40. Windows then add 7.5 to 10 percent uplift on top, which the sheet never explained. Is the intended margin 40 percent of the sell price, or 40 percent on top of cost? Those are different businesses. |
| 4.2 | Does anyone want the true gross margin shown on the costing beside the markup? It is a display change, not a price change. |

## 5. What the app will now tell you by itself

None of these changes a price. They start collecting the evidence that answers the questions above.

- Rate ages on every costing page and rates editor, so a price from 2007 says so before it is quoted.
- **Settings → Price Drift**: where the three lists disagree, and by how much.
- Quotes can be marked won or lost, with a reason. After a dozen, the win rate says whether the
  margin is set too high — the first time that question has been answerable.
- Order lines can record the minutes they actually took. The rates editor then shows whether the
  labour estimate is true, next to the number that would fix it. This matters most for awnings,
  where labour is $425 of a $1,119 cost, estimated at 330 minutes on a 2020 guess.
- Windows, awnings and cut glass can go on one job and become one purchase order.
