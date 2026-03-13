ALFAB web application repository.

This repository is now a single Next.js app (not a monorepo).

## Symphony

Symphony is configured for this repository. Track active work in the `Alfab`
Linear project.

## Local development

```bash
npm ci
npm run dev
```

## Build

```bash
npm run build
```

## Deployment

Use the `Makefile` targets (`init`, `deploy`, `down`) for server-side deploy scripts,
or the GitHub Actions workflows in `.github/workflows`.

For AWS RDS -> VPS migration and VPS cutover steps, see:

- `docs/vps-postgres-cutover.md`
