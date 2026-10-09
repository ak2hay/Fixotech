# 10. ERP: Administration (Analytics, People, Website, Organization, Users, Roles, Audit Log)

---

## 10.1 Analytics `/analytics`

This is management's business health view. **Permission:** `reports.view`. Sign in as **md@** to show everything.

**KPI cards:**

| Card | Meaning |
|---|---|
| Invoiced revenue | Total invoiced |
| Order book | Value of open orders |
| Open pipeline | Value of open quotations and RFQs |
| Gross margin | Cost permission only |
| Inventory value | Cost permission only |
| Receivables | Money owed, with the overdue amount |
| Open purchase orders | Value of open POs |
| RFQ to order % | "N won of N RFQs", the conversion rate |

**Other panels:**
- **Plant card:**
  - Job cards completed %.
  - Capacity in use %.
  - QC rejection rate, shown red above 5%.
  - Active projects, with the number delayed.
- **Revenue by customer:** the top 8 customers as bars, with order count and average order value.
- **Project margin table:** Project, Stage, Billed, Margin, and a Delayed badge. Click a row to open the project.
- **Demand forecast:** Item and Per month, the average monthly demand over the last six months. It feeds purchasing and production planning.

**Report APIs** (for exports or BI tools): `/reports/executive`, `/reports/sales`, `/reports/inventory`, `/reports/projects`, `/reports/forecast`.

---

## 10.2 People `/hr`

**Permission:** `hr.view`. Read-only.

- Search.
- **Columns:** Name (with email), Code, Department, Branch, Joined, Salary (only with `hr.view_salary`), Status.

**HR features available through the API:**
- Employees (`/hr/employees`).
- Attendance (`/hr/attendance`).
- Leave requests and decisions (`/hr/leave`). You cannot decide your own leave.
- Company assets issued to staff (`/hr/assets`).

**Roadmap:** full HR screens and a payroll integration. The design connects to an existing payroll provider instead of rebuilding payroll.

---

## 10.3 Website (content management) `/content`

"Edit what fixotec.com shows. Changes are live within five minutes." No developer or redeploy is needed.

- **Permissions:** `content.view` to see the screen; `content.edit` and `content.create` to make changes.
- **Who has them:** Admin, MD, CEO and Specification Manager.
- Prices and stock are **never** edited here. They stay in the product master.

### Products tab
1. Search by name or SKU, click **Find**, and pick a product. Unpublished products show a "hidden" badge.
2. Edit:
   - **Published on website** checkbox. Tick it to make the product visible on the public site.
   - **Photo gallery:** **+ Add photos**, move photos left or right, **Set main**, remove.
   - **Name**, **Category**, **Short description**, **Finish**.
   - **Features** and **Applications**, one per line.
   - **SEO title** and **SEO description**: what Google shows.
   - **Segments** checkboxes: hvac, plumbing, electrical, fire-fighting, multiple-services.
3. Click **Save product**.

**Datasheets panel:**
1. Click **Add datasheet**, choose a PDF and an optional title. It is uploaded as a **draft** and shared with PUBLIC, CUSTOMER, DISTRIBUTOR and CONSULTANT.
2. Click **Approve** on the version. **The website shows only the latest approved version.**
3. To update it, click **Upload revision**, then approve the new revision. The old approved file is kept as history.

The person who uploads a file cannot approve it, so a second person must approve (file 6).

### Categories tab
- **Table:** Image, Category (sub-categories indented), Slug, Order, Products, **Edit**.
- **New category** form:
  - **Name** (required)
  - **Slug**: the URL part, required, and only set when creating
  - **Parent**
  - **Description**
  - **Sort order**
  - **Category image**

### News tab
- A post list with live or hidden badges, and a **New post** button.
- **Fields:**
  - **Published**
  - **Title** (required)
  - **Slug**: only when creating
  - **Publish date**
  - **Excerpt**
  - **Cover image**
  - **Body**, in HTML: `<p>`, `<h2>`, `<ul>` and `<img>`
- Click **Save post**.

### Service areas tab
One card per service, plus a blank "New service area" card. Fields: **Live**, **Title**, **Order**, **Slug** (new only), **Summary**, **Icon**. Click **Create** or **Save**.

### Segments & sectors tab
One card per segment or sector. Fields:
- **Live**
- **Summary**
- **Body**: write `## Heading` for each application. Each heading becomes an application block on the website.
- **Tile image**
- **Hero photo**: sectors only

Click **Save**. New segments or sectors cannot be created here.

**CMS features with no screen yet** (API only): home page blocks (hero, banners, milestones, why, about, careers), solutions, industries, project case studies, and System finder rules.

---

## 10.4 Organization `/organization`

**Permission:** `organization.view`. The screens are read-only; changes go through the API.

- **Structure tab:**
  - Legal entities, with tax registrations and bank accounts. Account numbers are masked.
  - **Branches & plants:** region badge, Archived badge, offices, plants and their warehouses.
  - Departments and sub-departments.
- **Finance tab:** cost centres, profit centres, financial years, currencies and units.
- **Settings tab:** business settings shown as JSON:
  - `sla`: service ticket response hours.
  - `company`: company details.
  - `procurement`: `buyerAuthority`, the PO auto-approve limit.

**Demo data:** Fixotec (Demo Entity) FIX-IN; branches Pune HQ, Delhi, Chennai and Dubai; plant PLT-PUN; departments CORP, SALES, ENG, MFG, PROC, WH, PRJ, FIN, HR and SVC.

---

## 10.5 Users `/users`

**Permission:** `users.view`.

- **Columns:** Name, Email, Type, Job title, Roles, MFA, Active, Last login.

### How to invite a user (staff or portal)
1. Click **Invite user**. You need `users.create`.
2. Fill in:
   - **Name** (required)
   - **Email** (required)
   - **Temporary password** (required): at least 10 characters, with uppercase, lowercase and a number
   - **Roles** (required): role keys separated by commas, for example `sales_executive` or `customer`
   - **Type**: STAFF for ERP users, EXTERNAL for portal users
   - **Customer**: required for portal users. It links them to their company, and they only see that company's data.
   - **Job title** and **Phone**
3. Click **Save**. Give the user their email and temporary password.

**Example: giving a new contractor access to the portal**
- Type: EXTERNAL
- Customer: Apex MEP
- Roles: `customer`

### Deactivating and reactivating
- Open a user and click **Deactivate** or **Reactivate** (needs `users.edit`).

Safety rules:
- You can't deactivate yourself or change your own roles.
- At least one active super admin must remain.
- Only a super admin can change another super admin.

**Two-step verification (MFA):** users can turn on authenticator-app MFA with recovery codes through the API (`/auth/mfa/setup`, `/auth/mfa/enable`). The ERP has no screen for this yet.

---

## 10.6 Roles `/roles`

**Permission:** `roles.view`. Editing needs `roles.edit`.

1. The left panel lists every role, with its user count, permission count, and a "Portal" badge for external roles.
2. The right panel shows permission checkboxes grouped by resource, with a filter box.
3. Tick or untick permissions and click **Save changes**.

Rules:
- `super_admin` is locked; it "always keeps every permission".
- You can't grant a permission you don't hold, and you can't edit a role you hold.

See file 1 for every role's default permissions.

---

## 10.7 Audit log `/audit`

**Permission:** `audit.view`. Admin, MD, CEO and Finance Head have it. Read-only.

- **Columns:** When, Action, Entity, Record, Actor ID, IP.
- **Every important action is recorded** with who, what, when, the IP address, and a **before and after** snapshot. Examples:
  - Logins and failed logins
  - Discount changes
  - Status changes
  - Approvals
  - Stock movements
  - Role changes
- Secrets such as passwords, MFA secrets, tokens and bank account numbers are blanked out in snapshots.
- Every status change is also kept in a **workflow history** (API `GET /workflow/:entityType/:entityId`).

## Practice exercise

1. As **admin@**, open **Website**. Publish the "FXR Mounting Rail" product, add a feature line, and save. Within 5 minutes, check http://localhost:3000/products.
2. Invite a portal user `buyer@apexmep.example`: type EXTERNAL, customer Apex MEP, role `customer`. Sign in to the portal with that account.
3. Open **Roles**, give `sales_executive` the `reports.view` permission, then sign in as **sales@** and confirm Analytics now appears.
4. Open **Audit Log** and find your last three actions.
