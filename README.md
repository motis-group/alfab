ALFAB web application repository.

This repository is a single Next.js app, not a monorepo. `projects/` holds the
paper trail, never a second copy of the code.

| Path | Holds |
| --- | --- |
| `app/`, `components/`, `common/`, `utils/`, `modules/` | The application. Imports resolve through the aliases in `tsconfig.json` and `next.config.js`. |
| `scripts/`, `.github/workflows/`, `Makefile` | Provisioning, deploy, and CI. All paths anchor on the repository root. |
| `docs/` | Schema SQL the deploy applies, the legacy Lotus sheet the costing engine was ported from, and repository-level infrastructure notes. |
| `projects/<name>/` | One directory per project: `discovery/` (the problem), `development/` (the build), `delivery/` (the client-facing record). Bootstrap by copying `projects/_template/`. |
| `.stygian.yml` | Identity spine key. Joins this repository to everything else about the client. |

## Local development

```bash
npm ci
npm run dev
```

## Tests

```bash
npm test
```

## Build

```bash
npm run build
```

## Deployment

Use the `Makefile` targets (`init`, `deploy`, `down`) for server-side deploy scripts,
or the GitHub Actions workflows in `.github/workflows`.

For AWS RDS -> VPS migration and VPS cutover steps, see:

- `projects/costing/development/ops/vps-postgres-cutover.md`

For the calculator's CAD file import (DXF/DWG/SVG) and the optional DWG converter, see:

- `projects/costing/development/specs/cad-import.md`

For the window costing model (legacy Lotus sheet port) and its rates, see:

- `projects/costing/development/specs/window-costing.md`

For glass quoting, the minimum charge and where glass rates live, see:

- `projects/costing/development/specs/glass-quoting.md`

For the awning costing model (legacy Excel sheet port) and its rates, see:

- `projects/costing/development/specs/awning-costing.md`

For how old a price is and where the three price lists disagree, see:

- `projects/costing/development/specs/pricing-health.md`

For quote outcomes and whether the labour estimates hold up, see:

- `projects/costing/development/specs/feedback-loops.md`

For a job spanning windows, awnings and cut glass, see:

- `projects/costing/development/specs/jobs.md`
