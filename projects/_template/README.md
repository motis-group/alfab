# <project> — <one-line purpose>

<Two or three sentences: the business ask, where it lands, the current phase.>

State: <planning | building | UAT | live>.

## Layout

Three questions, three directories. Delete the rows you do not use; add a row
for anything you add.

| Path | Holds |
|---|---|
| `discovery/` | **The problem.** Read-mostly reference material. |
| `discovery/brds/` | Requirements and signed scope. Binary documents keep a `.md` twin. |
| `discovery/findings/` | Dated write-ups (`<topic>_YYYY-MM-DD.md`): source analysis, verification runs. |
| `development/` | **The build.** |
| `development/tasks/` | One directory per task; pipeline-stage artefacts. See `tasks/README.md`. |
| `development/specs/` | Design documents and data models on their way into the app: schemas, module specs, screen flows. The shipped code lives once, at the repository root. |
| `development/tests/` | Project-specific test assets beyond the suite that ships with the app. |
| `development/ops/` | Migration, cutover, and backfill one-offs, each with its plan. |
| `delivery/` | **The client-facing record.** |
| `delivery/uat/` | Test register, UAT case sheet, issue tracker, sign-off. |
| `delivery/updates/` | Status updates sent to the client. |
| `delivery/handover/` | SOPs, support handover, go-live record. |

## Conventions

- Generated output the client reads lives under `delivery/`; generated output
  nobody reads is gitignored.
- Cross-layer paths anchor on the repository root, never on a sibling
  project. A runbook here still says `./scripts/deploy.sh`, and is still run
  from the root.
