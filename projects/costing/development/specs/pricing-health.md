# Pricing health

Three calculators price work: glass at `/glass/quote`, windows at `/glass/windows`, awnings at
`/glass/awnings`. Golden checks hold the window and awning costings to their source sheets. A price
can match its sheet and still be wrong, because the price can be old. This page covers how the app
shows the age of a price, and how it keeps a shared price the same in every list.

Nothing here blocks a quote.

| Part | Location |
| --- | --- |
| As-at date reader and grading | `utils/rate-age.ts` |
| Age badge and review card | `components/RateAgeNotice.tsx` |
| One price for a shared item | `utils/shared-rates.ts` |
| Cross-list comparison | `utils/rate-drift.ts` |
| Drift report | `/settings/drift` (`app/settings/drift/page.tsx`) |
| Checks | `utils/rate-age.test.ts`, `utils/rate-drift.test.ts`, `utils/shared-rates.test.ts` |

## How old a price is

Every rates document records when each group of prices was last known good, as free text an
estimator typed: `Oct 2021`, `July 2007`, `Apr 2010 (etch), Mar 2015 (powder coat)`, `unknown`.

That text is kept rather than replaced by a date column, because it carries detail a single date
cannot. `parseAsAt` reads the **oldest** date out of it, which is the conservative answer, and grades
what it finds:

| Grade | Meaning |
| --- | --- |
| current | Under 12 months |
| ageing | 12 to 23 months |
| stale | 24 months or more |
| unknown | The text names no date |

`unknown` is treated as needing attention rather than as fresh. A price nobody dated could be any
age. A bare year reads as January of it, so an undated month cannot look newer than it is.

The glass, window and awning rates editors show the grade beside each section, and a review card
lists the sections that need attention. No costing page shows the grade, so the estimator who quotes
a price does not see its age. The glass rates carry one as-at date per section, `unknown` until
somebody fills it in.

## One price for a shared item

The same pane of glass, the same hour of labour and the same ceramic banding appear in more than one
list. The estimator sets each shared rate in one list, and `utils/shared-rates.ts` copies it into the
others:

| Rate | Set in | Copied into |
| --- | --- | --- |
| 5, 6, 8, 10 and 12 mm Clear, 5 mm Dark Grey, 6 mm Super Grey | Glass price list | Window rates |
| 6 mm Super Grey, ceramic banding, flat polish | Glass price list | Awning rates |
| Labour per hour | Window rates | Awning rates |

The rates editors show a copied rate as read-only. Glass with no match in the glass price list, such
as laminate, acrylic, polycarbonate and the tints, keeps its own price in the list that holds it.

The window costing adds a glass loading to some list prices. A copied window price is the shared price
divided by that loading, so the two agree once the costing applies the loading.

## Price drift

**Settings → Price Drift** compares every shared item on its effective price, after each list's
loading. Comparing raw list prices would report a gap that is not there and miss one that is.

`EQUIVALENCES` in `utils/rate-drift.ts` declares which items are the same product. A match is
declared by hand, never by label: "6 mm Tint A/P" and "Grey" may or may not be the same product, and
a wrong match is worse than a missing one. Uncertain matches stay unmatched.

A gap under 2 percent is rounding. Each shared rate is set in one list, so the report expects no
larger gap. A larger gap means a list holds its own price for a shared item, and the report lists it
for review. When three or more gaps sit within 6 percentage points of each other, the report also
says they can be one price rise that one list did not get. A gap has no sign, so the report does not
check which list is dearer on each item.

## Open questions

Which prices are right is a question for the client. The glass price list sets the shared glass
prices, and the window rates set the labour rate for awnings. Questions 3.6 to 3.8 in
[pricing-currency-decisions.md](../../discovery/pricing-currency-decisions.md) ask what the window
glass price means and whether awning labour costs less.
