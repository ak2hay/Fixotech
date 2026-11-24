# 17. Deploy pipeline

GitHub is the single deploy path for Fixotec. Push to `main` on `ak2hay/Fixotech` (or run the API workflow by hand) to ship changes. Do not copy a tarball onto the VM or run `vercel --prod` as the normal release process.

## Frontends (Vercel)

The four Vercel projects in the `akshrkdgmailcoms-projects` team are connected to this repository, production branch `main`, Node 22.x:

| Project | Root directory | Production URL |
|---|---|---|
| `fixotec-web` | `apps/web` | https://fixotec.rkyves.com |
| `fixotec-portal` | `apps/portal` | https://fixotec-portal.rkyves.com |
| `fixotec-erp` | `apps/erp` | https://fixotec-erp.rkyves.com |
| `fixotec-bim` | `apps/bim` | https://bim.rkyves.com |

Each project has an Ignored Build Step (`deploy/vercel-ignore.sh`) so a push only rebuilds that app when `apps/<app>`, shared packages, or the workspace lockfile/tooling changed. A docs-only commit should skip all four frontend builds.

Environment variables and custom domains stay in the Vercel project settings; they are not committed.

## API (GitHub Actions to the shared VM)

Workflow: [`.github/workflows/deploy-api.yml`](../../.github/workflows/deploy-api.yml).

It runs on a push to `main` that touches the API, packages, lockfile, compose/Docker files, or `deploy/`, and on `workflow_dispatch`. Before deploying it runs typecheck, lint and unit tests. It does not wait on the coverage-audit job, which is allowed to fail in CI.

The deploy job ships a `git archive` of the commit over SSH and runs a restricted command on the Fixotec VM, `/opt/fixotec/deploy/gh-deploy.sh`. That key cannot open a shell and cannot touch the other stacks on the machine. The script:

1. Extracts the archive into `/opt/fixotec` without overwriting `.env` or `backups/`.
2. Tags the running `fixotec-api:current` image as `fixotec-api:previous`.
3. Builds the `api` and `migrate` images with `docker compose -p fixotec`.
4. Runs `prisma migrate deploy`.
5. Restarts only `fixotec-api`.
6. Checks https://api.rkyves.com/api/v1/health/ready (and the local listener). If the new API is unhealthy it retags the previous image and starts it again.

Existing env files, nginx, and the other compose projects on the VM are left alone.

## What not to do

- Do not put the VM root password, API secrets, or `.env` files in GitHub or in this repo.
- Do not deploy by copying an ad-hoc tarball onto the VM unless you are recovering from a broken pipeline.
- Do not run database migrations from a laptop against production `DATABASE_URL`.
