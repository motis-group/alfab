ALFAB web application repository.

This repository is now a single Next.js app (not a monorepo).

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
