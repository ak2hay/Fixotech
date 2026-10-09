# 4. ERP basics (http://localhost:3002)

The ERP is the internal app where Fixotec staff run the whole business. Code: `apps/erp`. This file covers signing in, the screen layout, and the four **Command** screens: Overview, Approvals, Notifications and Assistant.

## 4.1 Signing in

1. Open http://localhost:3002. You are redirected to `/login`, which shows "Sign in to Fixotec ERP / Use your company account."
2. Enter your **Email** and **Password**, then click **Sign in**.
3. If two-step verification is on, enter the 6-digit **Authenticator code** (or a recovery code) and click **Verify**.
4. You land on the **Overview** dashboard, or on the page you were trying to open.

**Security behaviour:**

| Behaviour | Detail |
|---|---|
| Account lockout | 5 wrong passwords lock the account. The lock doubles each time, up to 60 minutes. |
| Session length | 8 hours, checked against the database on every request. |
| Expiry warning | 10 minutes before expiry a message appears: "Your session ends in N minutes…" with **Sign in again**. |
| After expiry | You are sent to `/login?reason=expired`. |
| Single sign-on | Google and Microsoft are supported for existing users once configured. |
| Who should use it | The ERP is for **staff**. Partners use the portal. |

## 4.2 The screen layout

### Sidebar
The sidebar is grouped into sections. Items you have no permission for are hidden.

| Section | Items |
|---|---|
| **Command** | Overview, Approvals, Notifications, Assistant |
| **Commercial** | Leads, Customers, Projects, RFQs, Quotations, Orders |
| **Engineering** | Engineering, BOQ, Product Library, CAD / BIM, Technical Submittals, Documents |
| **Supply chain** | Vendors, Purchases, Warehouses, Inventory, Dispatch |
| **Plant** | Production, Shop Floor, Quality, Non-conformance |
| **Field & finance** | Site Execution, Service, Invoices, Expenses |
| **Administration** | Analytics, People, Website, Organization, Users, Roles, Audit Log |

- **Badges** (numbers) on menu items:
  - **Approvals:** pending approvals for your role.
  - **Notifications:** your unread notifications.
  - **RFQs:** open RFQs assigned to you.
- The **collapse** toggle shrinks the sidebar to icons, and the app remembers your choice.
- On a phone, the hamburger button opens the sidebar as a drawer.

### Top bar
- **Global search:** click "Search projects, RFQs, products, customers..." or press **Ctrl + K** (Cmd + K on Mac).
  - Type 2 or more characters to search projects, RFQs, quotations, sales orders, customers, products and documents.
  - A **Go to** list jumps straight to any screen you're allowed to open.
- **Notification bell:** shows the unread count and opens a drawer.
  - Click a notification to mark it read and open the related record.
  - **Mark all read** clears them all.
- **Help (?)** icon: not wired up yet.
- **User menu:** shows your avatar, name and job title. It contains **Sign out**.

### How screens are built
Most screens follow the same patterns, so once you learn one you can use them all:
- **List page:**
  - Title, a **search box**, a **Status** filter, and a record count.
  - A sortable table with 25 rows per page.
  - Click a row to open the record.
  - A create button (for example **New lead**) opens a form. After **Save** you go to the new record.
- **Detail page:**
  - A breadcrumb, the title with a coloured **status pill**, and action buttons.
  - Buttons only appear when you have the permission *and* the record's status allows the action.
  - A Details card, related tables, and an **Activity** feed built from the audit log.
- If you open a record outside your access, you see "This record was not found or is outside your access".

## 4.3 Overview dashboard `/`

What you see depends on your permissions.

- **Greeting:** "Good morning, \<name\>", today's date, and "Here's what needs your attention today."
- **KPI cards** (need `reports.view`):

| Card | Detail |
|---|---|
| Revenue | 6-month sparkline and change vs last month |
| Orders | 6-month sparkline and change vs last month |
| Pipeline | 6-month sparkline and change vs last month |
| Receivables | Includes the overdue trend |
| Gross margin | Only with `products.view_cost` |

- **Today's actions:** each line links to the matching screen.
  - "N approvals waiting" opens `/approvals`.
  - "N RFQs due today" opens `/rfqs?due=today`.
  - "N engineering requests" opens `/engineering`.
  - "N delayed dispatches" opens `/dispatch`. A dispatch counts as delayed when it is older than 3 days and not yet shipped.
  - "N purchase orders pending" opens `/purchases`.
  - When there is nothing to do it says "Nothing waiting on you."
- **Sales pipeline funnel:** Leads → Opportunities → RFQs → Quotations → Negotiation → Won.
- **Recent RFQs** table: RFQ No., Project, Customer, Value, Stage, Due. The Due column shows "Overdue Nd", "Today" or "Tomorrow" where relevant.
- **Operations** card: Production % over the last 7 days, Warehouse utilisation %, Open purchase order value, Delayed dispatches.
- **Activity:** recent changes across the system.

**Demo tip:** sign in as **md@** to show the executive view with every card visible.

## 4.4 Approvals `/approvals`

"Discounts, engineering submissions and purchases waiting on your role." Needs `approvals.view`.

Each pending approval is a card showing:
- The type badge: Quotation, Engineering, Sales order, Purchase order or Expense.
- "for \<approver role\> · \<age\>".
- The record number, value, discount % and other key facts.
- An **Open record** link.

**How to approve or reject:**
1. Read the card. Click **Open record** to see the full quotation or request.
2. Optionally type a **Decision note**.
3. Click **Approve** or **Reject**. You need `approvals.approve`.
4. The record moves forward automatically:

| Record | Approve | Reject |
|---|---|---|
| Quotation | Approved | Rejected |
| Purchase order | Approved | Rejected |
| Engineering request | Approved | Rejected |

When nothing is pending, the page says "You're all caught up."

Rules: you cannot approve a request you raised yourself. MD, CEO and Super Admin can decide any approval. The full rule table is in file 1, section 1.5.

**Demo data:** QT-0100 (12% discount) is waiting for Sales Head. Sign in as **saleshead@** to approve it live.

## 4.5 Notifications `/notifications`

- **Tabs:** **All** and **Unread** (with a count).
- Each row shows an unread dot, title, body and age. Clicking it marks it read and opens the linked RFQ, quotation, project, sales order or engineering request.
- **Mark all read.**
- **Scan for alerts:** only roles with `notifications.edit` see this (Super Admin, MD, CEO). It runs the alert check immediately instead of waiting for the hourly job. The check covers:
  - Products below safety stock: Warehouse Manager is notified.
  - Overdue invoices: Finance Head is notified.
  - Projects past their completion date: Project Manager is notified.

**What triggers a notification (examples):**
- A website enquiry.
- An RFQ assigned to you.
- A quotation sent (to the customer) or accepted (to Sales Heads).
- A lead reassigned to you.
- A purchase order auto-approved (to procurement).
- The alerts listed above.

If SMTP is configured, every notification is also emailed.

## 4.6 Operations assistant `/assistant`

A question box for asking about live business data in plain English.

1. Type a question, or click one of the suggestion chips:
   - "Which products are below safety stock?"
   - "Show pending RFQs above 10 lakh"
   - "Why is Skyline Towers delayed?"
   - "Find the datasheet for strut channel"
   - "What is the demand forecast?"
2. Click **Ask**. Answers appear newest first, with a results table where useful.

**What it understands (5 question types):**

| Question type | Permission needed | Answer |
|---|---|---|
| Open RFQs (with value filters) | rfqs.view | List of matching RFQs |
| Products below safety stock | inventory.view | Items and quantities |
| Why a project is delayed | projects.view | Open site issues, backordered items, unapproved engineering, completion date already passed |
| Find a datasheet | documents.view | Matching documents |
| Demand forecast | reports.view | Average monthly demand per item over the last 6 months |

- With `AI_API_KEY` set, an AI model works out what you are asking. Without it, keyword matching is used, so the demo works offline.
- The limit is 20 questions per minute.
- **Roadmap:** open-ended AI chat and forecasting beyond these 5 question types.

## Practice exercise

1. As **md@**, read every card on the Overview and explain each number aloud.
2. Press Ctrl + K and search "ABC".
3. As **saleshead@**, approve QT-0100 from `/approvals` with a note.
4. In the Assistant, ask "Why is ABC Data Center delayed?" and "Which products are below safety stock?".
