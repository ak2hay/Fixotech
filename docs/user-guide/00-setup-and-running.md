# 0. Setup and running Fixotec locally

## 0.1 What you need installed

- **Node.js 20 or newer**
- **pnpm 11.24** (`corepack enable`, then `corepack prepare pnpm@11.24.0 --activate`)
- **Docker Desktop**, which runs PostgreSQL 16 and Redis 7

## 0.2 First-time setup

Run these from the project root (`a:\fixotec`).

1. Create your environment file (skip this if `.env` already exists):
   ```powershell
   copy .env.example .env
   ```
   Set `JWT_SECRET` to a random string of at least 32 characters.
2. Install dependencies:
   ```powershell
   pnpm install
   ```
3. Start the databases, create the schema and load the demo data:
   ```powershell
   pnpm setup
   ```
   This runs these steps in order:
   - `docker compose up -d` starts Postgres on host port **5435** and Redis on **6381**.
   - `pnpm db:generate` generates the Prisma client.
   - `pnpm db:push` creates the database tables.
   - It builds the shared and db packages.
   - `pnpm db:seed` loads the demo users, products, projects, RFQs and the rest (see section 0.6).
4. Start everything:
   ```powershell
   pnpm dev
   ```
   This starts the API and the three Next.js apps together.

## 0.3 Where everything runs

| App | URL |
|---|---|
| Public website | http://localhost:3000 |
| Partner portal | http://localhost:3001 |
| ERP | http://localhost:3002 |
| API | http://localhost:4000 by default. Your `.env` sets `API_PORT=4001`, so locally it is **http://localhost:4001** |
| Swagger API docs | `<api-url>/api/docs` (on outside production) |
| API health | `<api-url>/api/v1/health` and `/api/v1/health/ready` (the second also checks the database and Redis) |

## 0.4 Useful commands

| Command | What it does |
|---|---|
| `pnpm dev` | Runs all apps in development mode |
| `pnpm db:up` | Starts only the Docker databases |
| `pnpm db:seed` | Loads the demo data again |
| `pnpm smoke` | Runs an automatic end-to-end check of the main flows (`scripts/smoke.mjs`) |
| `pnpm test` / `pnpm test:e2e` | Unit tests and end-to-end API tests |
| `pnpm typecheck`, `pnpm lint` | Code quality checks |
| `pnpm build` | Production build of every package |
| `pnpm import:fixotec:crawl` and `pnpm import:fixotec:load` | Copy the real in.fixotec.global catalogue into `storage/import/fixotec` and load it |
| `pnpm vm:up` | Starts the production Docker stack (`docker-compose.prod.yml`) |

## 0.5 Resetting the demo before a presentation

Every flow you rehearse leaves records behind, such as new RFQs and accepted quotations. To get back to a clean state:

1. Stop `pnpm dev`.
2. Reset the database. Choose one of these:
   - Delete the Docker volume with `docker compose down -v`, then run `pnpm setup` again.
   - Run `pnpm --filter @fixotec/db exec prisma db push --force-reset`, then `pnpm db:seed`.
3. Start `pnpm dev` again.

New records start at number **0200** (for example `RFQ-0200`, `QT-0200`), because the seeded records use 0100 to 0107. After a reset, your first demo RFQ will again be `RFQ-0200`.

## 0.6 What the demo data contains

- **Company:** "Fixotec (Demo Entity)", code FIX-IN.
  - Branches: Pune HQ, Delhi, Chennai and Dubai.
  - Plant PLT-PUN and warehouse WH-PUN, with one bin per zone (RAW, WIP, FG, REJECTED, QC_HOLD, SCRAP).
  - Work centre WC-FAB with machines LASER-01, PRESS-01, CNC-02 and LASER-02.
  - Departments, cost centres, financial year FY 2026-27, currencies INR, USD, EUR and AED, and units NOS, M, KG and SET.
- **Customers:**
  - CUS-APEX Apex MEP Contractors: MEP contractor, ₹25 lakh credit limit, CUSTOMER price list.
  - CUS-WEST Westline Building Systems: distributor, ₹40 lakh credit limit, DEALER price list.
  - CUS-NORTH Northstar Consulting: consultant.
- **Vendor:** VEN-STEEL Deccan Coil Processors.
- **Products:**
  - FXR Mounting Rail (7 variants, FXR-4121-15 to FXR-4162-25)
  - SRS Heavy Clamp (50, 100 and 150 mm)
  - Threaded Rod M10 (1 m and 2 m)
  - FXR Connector CON-4141, Wedge Anchor ANC-M10 and Heavy Duty Hanger HNG-M10
  - A bill of materials for FXR-4141-20, opening stock for 4 items, and a datasheet PDF
- **Transactions:**
  - Projects PRJ-0100 "ABC Data Center" (Engineering, overdue), PRJ-0101 "Harbour Hospital Expansion" (Quoted), plus PRJ-0102 to PRJ-0107
  - Lead LD-0100
  - RFQs RFQ-0100 to RFQ-0104
  - Quotation QT-0100: 12% discount, Under review, waiting for Sales Head approval
  - Sales order SO-0100 for Westline, Confirmed
  - Purchase order PO-0100, Approved
  - Production order PRD-0100 with job card JOB-0100
  - Engineering request ENQ-0100, site issue ISS-0100, service ticket TKT-0100 (High priority) and submittal SUB-0100
- **Distributor and website data:**
  - A distributor target and the "Rail volume Q4" scheme with one claim
  - A case study, home page content blocks and 7 System finder rules

## 0.7 Demo mode

`NEXT_PUBLIC_DEMO_MODE=true` is the default. It does the following:

- Shows an amber "Demo environment… sample data" banner on the ERP and portal.
- Shows a "Concept demo prepared for Fixotec…" banner on the website.
- Tells search engines not to index any page and returns an empty sitemap.
- Puts the public website behind HTTP Basic Auth. The username is `DEMO_USER` (default `fixotec`) and the password is `DEMO_PASS`. In development with an empty `DEMO_PASS` the site stays open. In a production build without `DEMO_PASS` the site returns a 503 error.

Set it to `false` for a real launch.

## 0.8 Important environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (required) |
| `JWT_SECRET` | Session signing, 32 or more characters (required) |
| `REDIS_URL` | Rate limits and the hourly alert job. Without it, background jobs don't run |
| `MFA_ENCRYPTION_KEY` | Encrypts two-step verification secrets (required in production) |
| `WEB_ORIGIN`, `PORTAL_ORIGIN`, `ERP_ORIGIN`, `API_PUBLIC_URL` | Allowed browser origins and the public API address |
| `STORAGE_DRIVER` (`local` or `s3`), `S3_*` | Where uploaded files are stored (default: the `storage/` folder) |
| `SMTP_*` | When set, every in-app notification is also emailed |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | Smarter question understanding for the ERP Assistant (it works without them using keywords) |
| `GOOGLE_CLIENT_ID`, `MICROSOFT_*` | Google and Microsoft single sign-on for existing users |
| `CAPTCHA_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Anti-spam CAPTCHA on website forms |
| `ACCOUNTING_TARGET`, `TALLY_BASE_URL`, `ZOHO_BOOKS_*` | Invoice export to Tally or Zoho Books |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Demo admin login and the password for every seeded user |
| `NEXT_PUBLIC_DEMO_MODE`, `DEMO_USER`, `DEMO_PASS` | Demo safeguards (section 0.7) |

## 0.9 Production deployment (overview)

- **Backend server (VM):** `docker-compose.prod.yml` runs Postgres, Redis (password protected), the API (on `127.0.0.1:4200` behind nginx) and a `migrate` step (`prisma migrate deploy`).
- **Front-end apps:** the web, portal and ERP apps are deployed on **Vercel**. Each one forwards `/api/v1/*` calls to the VM.
- **Scripts in `deploy/`:**
  - `install.sh` generates secrets.
  - `rollout-site.sh` builds, backs up, migrates, switches the API over and waits for the health check.
  - `backup.sh` makes GPG-encrypted backups of the database and files.
  - `restore-test.sh` tests a restore.
  - `harden-vm.sh` hardens the server, and the nginx configs set up the web server.
- **Monitoring:** optional Sentry error reporting.

## 0.10 Troubleshooting

| Symptom | Fix |
|---|---|
| A page redirects to `/login` all the time | Your session cookie expired (sessions last 8 hours). Sign in again |
| "Account locked" | 5 wrong passwords lock the account. The lock doubles each time, up to 60 minutes. Wait, or re-seed |
| The ERP shows "You do not have access to this page" | The login's role lacks that permission. Use `admin@demo.fixotec.test` |
| The website, or the distributor/consultant catalogue, shows no products, or a distributor order fails with "Article is not in the catalogue" | Products in the seed are *not published*. Publish them in ERP **Website** (`/content`), or run the Fixotec catalogue import |
| No notifications appear | Run **Scan for alerts** as admin on `/notifications`, or set `REDIS_URL` for the hourly job |
| Docker port in use | Something else is using 5435 or 6381. Stop it or change `docker-compose.yml` |

## Practice exercise

1. Run `pnpm setup` and `pnpm dev`.
2. Open all three apps and Swagger.
3. Sign in to the ERP as admin and to the portal as the customer.
4. Run `pnpm smoke` and read what it checks.
