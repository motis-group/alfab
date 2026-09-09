# One job, several product types

A boat needs windows, awnings and cut glass. Each was priced on its own page and sent as its own
purchase order, so the customer got three numbers and somebody added them up by hand.

The job basket is the layer above the three calculators. Each one still stages its own items the way
it always did; "Add To Job" moves them up to the job, and the job becomes one purchase order with a
line for each item, whatever its type.

| Part | Location |
| --- | --- |
| The basket | `utils/job-basket.ts` |
| Panel and the hook that keeps a page in step | `components/JobPanel.tsx` |
| Draft handover | `utils/quote-to-order.ts`, draft kind `job` |
| Order side | `app/glass/new/page.tsx` |
| Checks | `utils/job-basket.test.ts` |

## Two levels, on purpose

The per-page quote was kept rather than replaced. Staging several windows and then adding them all
to the job is how the work is actually done, and collapsing the two would have meant rebuilding
three working pages to gain nothing.

- **The page quote** holds one product type and knows how to print it.
- **The job** holds anything and becomes the order.

The job panel appears on all three calculators, so the running total is visible from wherever the
estimator is working.

## Where it lives

Session storage, under `alfabJobBasket`. A job is built by walking between pages and finished in one
sitting. Nothing in the basket is the record of anything — a saved quote and a purchase order are —
so losing it costs a few minutes of retyping and never a price.

A `alfab-job-changed` event fires on write, which is how a page that is already open notices that
another one added to the job.

Anything unrecognised in storage is dropped rather than trusted: a line with no costing spec cannot
become an order line, so it is filtered out on read.

## Details

The first page to name the customer names them for the job; later pages do not overwrite it. The
order carries the job's customer, so a purchase order does not have to be matched by name.

Each line keeps the stamp of the rates that priced it, so a line on the order can still be
reproduced later. A glass line keeps its own markup, since the glass calculator prices per piece.
