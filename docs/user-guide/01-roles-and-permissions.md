# 1. Roles and permissions

Fixotec uses **role-based access control (RBAC)**. Each user has one or more **roles**. Each role is a set of **permissions**. The ERP and portal hide screens and buttons the user isn't allowed to use, and the API refuses the request as well. Hiding a button is only for convenience; the API check is what actually protects the data.

Source of truth: `packages/shared/src/index.ts` (`PERMISSIONS`, `ROLE_PRESETS`).

## 1.1 The permission model

A permission is written `resource.action`, for example `quotations.approve`.

**Resources (32):** organization, users, roles, customers, leads, projects, products, documents, rfqs, quotations, sales_orders, engineering, boq, vendors, purchases, inventory, warehouses, production, quality, ncr, dispatch, sites, service, invoices, payments, expenses, hr, reports, content, approvals, audit, notifications.

**Actions (10):**

| Action | Meaning |
|---|---|
| view | See lists and records |
| create | Make new records |
| edit | Change records and statuses |
| delete | Remove or archive |
| approve | Make approval decisions (for a customer, `quotations.approve` means *accept a quote*) |
| export | Export data |
| download | Download files and PDFs |
| share | Create share links for documents |
| assign | Give a record to another person |
| override | Bypass a safety check (for example release a credit hold, or allow negative stock) |

**Two special keys:**
- `products.view_cost`: shows purchase or manufacturing cost, margin, gross margin and inventory value. Without it, these columns and cards are hidden everywhere.
- `hr.view_salary`: shows salaries on the People page.

## 1.2 How the apps enforce it

- **The sidebar** hides every item whose permission the user lacks.
- **Opening a URL directly** shows "You do not have access to this page" if the user lacks the permission for that screen.
- **Buttons** such as **Approve**, **Create sales order** or **Release credit hold** only appear with the right permission *and* when the record is in the right state.
- **The API** checks permission on every endpoint (`@RequirePermissions`).
- **Data scope:** portal (external) users only ever see their own company's projects, RFQs, quotations, orders, invoices and documents (`apps/api/src/scope.ts`).

## 1.3 Staff roles

`super_admin`, `managing_director` and `ceo` hold **every permission**.

| Role | What it can do |
|---|---|
| `finance_head` | View organization. View, approve and override customers (credit limits and holds). Invoices: view, create, edit, approve, export. Payments: view, create, approve, export. Expenses: view, approve, export. Reports. HR with salary. View and approve purchases. **Audit log.** Documents. Approvals. |
| `sales_head` | Customers (including approve). Leads, projects and RFQs including assign. Quotations: view, create, edit, approve, export, download. Sales orders: view, create, edit, approve. Products with cost. Documents including share. Reports. View engineering. BOQ: view and create. Approvals. |
| `sales_manager` | Same as sales head, but no cost view, no reports, and no customer approve. Can approve quotations. |
| `sales_executive` | Customers, leads, projects and RFQs (create). Quotations: create and edit (**cannot approve**). View sales orders, products, documents and BOQ. |
| `specification_manager` | Edit products. Create documents. **Website content (CMS) view and edit.** View engineering. |
| `engineering_head` | Full engineering including approve and assign. BOQ: create and edit. Documents including approve. Approvals. |
| `design_engineer` | Engineering: view, create, edit. BOQ: create. Documents: create. View products, projects and RFQs. |
| `bim_engineer` | Engineering: view and edit. Documents: create. View products and projects. |
| `project_manager` | Projects: edit and assign. Sites: full. View documents, BOQ, orders, dispatch and service. Reports. |
| `site_engineer` | Sites: view, create, edit. View projects, documents and BOQ. |
| `procurement_manager` | Vendors. Purchases including approve. View inventory and documents. Approvals. Reports. |
| `purchase_executive` | Vendors (create). Purchases: create and edit. View inventory and documents. |
| `production_manager` | Production including approve. View inventory and quality. Products with cost. Reports. |
| `production_supervisor` | Production: view and edit (shop floor). Quality: create. View inventory. |
| `qc_manager` | Quality and NCR including approve. View inventory. Create documents. |
| `warehouse_manager` | Warehouses. Inventory including **override**. Dispatch: create and edit. |
| `storekeeper` | View warehouses. Inventory: create. Dispatch: edit. |
| `dispatch_manager` | Dispatch including approve (**ship**). View inventory, orders and warehouses. |
| `hr` | HR including salary. View users and expenses. Create documents. |
| `accounts` | Invoices: create and edit. Payments: create. Expenses: edit. View customers, vendors and reports. |
| `service_engineer` | Service tickets: view, create, edit. View projects and documents. |

All staff roles also have `notifications.view`.

## 1.4 Portal (external) roles

| Role | Portal menu | Permissions |
|---|---|---|
| `customer` | Contractor | Projects. RFQs: view and create. Quotations: view, download, **approve (accept)**. View orders, dispatch and invoices (with download). Documents. Service tickets: view and create. |
| `contractor` | Contractor | Projects, RFQs (create), quotations (view and download, **not accept**), orders, documents, sites.view |
| `dealer` | Distributor | Products. Sales orders: view and **create**. Invoices. Documents. |
| `distributor` | Distributor | Dealer permissions plus `payments.view` |
| `consultant` | Consultant | Products. Documents. Projects. Engineering: view and **create**. View BOQ. |

## 1.5 Approval rules (seeded, configurable)

Approvals are **rules in the database**, not fixed in code (`/approval-rules` API). Rules are checked in priority order and the **first match wins**. Nobody can approve their own request. The role named in the rule can decide, and so can `super_admin`, `managing_director` or `ceo`.

| Record | Condition | Who approves |
|---|---|---|
| Quotation | Discount below 10% | `sales_manager` |
| Quotation | Discount 10% to below 20% | `sales_head` |
| Quotation | Discount 20% or more | `managing_director` |
| Purchase order | Over ₹5 lakh, up to ₹20 lakh | `procurement_manager` |
| Purchase order | Over ₹20 lakh | `managing_director` |
| Engineering request | Moved to Client approval | `engineering_head` |

Because the first quotation rule covers 0 to 10%, **every quotation needs at least one approval**.

Purchase orders that match no rule are approved automatically if they are within the buyer's authority (default ₹5,00,000, in organization setting `procurement`).

**Demo tip:** no demo user has the `sales_manager` or `engineering_head` role. For discounts under 10% and for engineering client approvals, sign in as **md@** or **admin@** to approve. For a 10-19% discount, **saleshead@** can approve.

## 1.6 Changing roles

In the ERP, **Administration > Roles** (`/roles`):

1. Pick a role on the left.
2. Tick or untick permissions (use the filter box to find them).
3. Click **Save changes**.

Safety rules:
- `super_admin` is locked and always keeps every permission.
- You cannot grant a permission you don't hold yourself, and you cannot edit a role you hold.
- At least one active super admin must always remain.

## Practice exercise

1. Sign in to the ERP as `sales@` and note which sidebar items are missing compared with `admin@`.
2. Open `/approvals` as `sales@`. You should be denied.
3. Open a quotation as `sales@` and as `saleshead@`, and compare: the Margin and Cost columns only appear for Sales Head, who has `products.view_cost`.
