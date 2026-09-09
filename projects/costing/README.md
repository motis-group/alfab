# costing — glass and door costing app for Alfab

A web application that prices custom glass and door configurations, holds
client records and quote history, and turns an accepted quote into an order.
It ships as a Next.js app from the repository root and runs at
alfabvic.com.au. The order-management extension in `discovery/brds/spec.md`
gives inbound purchase orders a home, which today are spread across
handwritten sheets, email, and Excel.

State: building.

## Layout

Three questions, three directories.

| Path | Holds |
|---|---|
| `discovery/` | **The problem.** Read-mostly reference material. |
| `discovery/brds/` | Requirements and signed scope. Binary documents keep a `.md` twin. |
| `discovery/window-costing-decisions.md` | Open questions the Lotus sheet left behind, waiting on Nick. |
| `discovery/awning-costing-decisions.md` | The same for the Excel awning sheet. |
| `discovery/pricing-currency-decisions.md` | Whether the prices themselves are still right. Ages, list disagreements, what margin means. |
| `discovery/findings/` | Dated write-ups (`<topic>_YYYY-MM-DD.md`): source analysis, verification runs. |
| `development/` | **The build.** |
| `development/tasks/` | One directory per task; pipeline-stage artefacts. See `tasks/README.md`. |
| `development/specs/` | Design documents and data models on their way into the app. |
| `development/tests/` | Project-specific test assets beyond the suite that ships with the app. |
| `development/ops/` | Migration and cutover runbooks, each with its plan. |
| `delivery/` | **The client-facing record.** |
| `delivery/uat/` | Test register, UAT case sheet, issue tracker, sign-off. |
| `delivery/updates/` | Status updates sent to the client. |
| `delivery/handover/` | SOPs, support handover, go-live record. |

## Conventions

- Generated output the client reads lives under `delivery/`; generated output
  nobody reads is gitignored.
- Cross-layer paths anchor on the repository root, never on a sibling
  project. A runbook here still says `./scripts/ec2-deploy.sh`, and is still
  run from the root.
- The schema files the deploy applies stay at `docs/*.sql`, because
  `scripts/apply-aws-postgres-schema.sh` reads them by that path. Their
  design notes live here; the files themselves do not.
