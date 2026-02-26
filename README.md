Monorepo for all Alfab projects.

## CI/CD

GitHub Actions now runs:
- `.github/workflows/ci.yml` on pull requests and pushes to `main` (build verification)
- `.github/workflows/deploy-ec2.yml` on pushes to `main` (EC2 deploy + DB migrations)

### Required GitHub Secrets

- `AWS_DEPLOY_ROLE_ARN`: IAM role assumed by GitHub OIDC for deploy
- `ALFAB_DEPLOY_BUCKET`: S3 bucket used for deployment artifacts
- `ALFAB_EC2_INSTANCE_ID`: target EC2 instance id (example: `i-03a46790bbbc273bc`)

### Database schema changes

Add SQL migrations under `web-app/db/migrations` with ordered names, e.g.:
- `0002_add_purchase_order_pricing.sql`

Each deploy runs `web-app/scripts/apply-db-migrations.sh`, which:
- Creates `schema_migrations` table (if missing)
- Applies each new migration once
- Fails if an already-applied migration file was modified (checksum mismatch)
