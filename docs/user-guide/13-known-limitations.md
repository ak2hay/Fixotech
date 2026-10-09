# 13. Known limitations and things to avoid in the demo

As the creator, you should know exactly where the edges are. This list comes from reading the code. Each item says what the limitation is, its impact, and how to handle it in a demo. Many are just "API built, screen not built yet". Describe those as **next-phase screens**, not missing features.

## 13.1 Screens not built yet (the API supports them)

| Missing UI | API that exists | How to handle it |
|---|---|---|
| Create purchase requisition, purchase order or goods receipt | `/purchases/requisitions`, `/purchases/orders`, `/purchases/receipts` | Show the Purchases lists and explain the flow. Use Swagger if needed |
| Create a dispatch (pick list) | `POST /dispatch` | Pre-create it through Swagger (file 12, section 12.8), then pick, ship, deliver and invoice in the ERP |
| Create a production order, or run MRP | `POST /production`, `POST /mrp/run` | Production orders appear automatically from backorders; show those |
| Record payments, vendor bills, accounting sync | `/payments`, `/finance/bills`, `/finance/sync` | Explain it; invoice status updates when payments are posted |
| Inventory transactions, transfers, bins | `/inventory/transactions`, `/inventory/transfers`, `/warehouses/:id/bins` | Inventory is read-only by design: "changes only through transactions" |
| Edit customers or vendors after creation | `PATCH /customers/:id` | Avoid editing live |
| Create products and variants | `POST /products`, `/products/:id/variants` | Products come from the catalogue import or the seed |
| Organization changes (branches, settings such as SLA) | `/organization/*` | The Organization page is read-only |
| HR attendance, leave and assets | `/hr/*` | People is a read-only list |
| MFA setup, password change, profile | `/auth/mfa/*`, `/auth/password` | Not available in the UI. Don't offer to show MFA setup |
| CMS home page blocks, solutions, industries, case studies, System finder rules | `/cms/blocks`, `/cms/solutions`, `/cms/industries`, `/cms/studies` | The Website screen covers products, categories, news, services, and segments and sectors |
| Document share links and archiving | `/documents/:id/share`, `/archive` | Not shown in the UI |
| Site visits and site reports (GPS check-in, labour, sign-off) | `/sites/visits`, `/sites/reports` | Describe as the future mobile site app |

## 13.2 Behaviour quirks to know

1. **Website RFQs cannot be quoted directly.** They have no customer attached, and **Generate quotation** fails with "RFQ needs a customer before it can be priced". There is no UI to attach a customer to an existing RFQ. In the demo, use an ERP-created RFQ for an existing customer.
2. **Portal RFQ lines are free text**, not matched to the catalogue, so a quotation generated from them prices those lines at **zero**. In the demo, create the priced RFQ in the ERP with the catalogue product picker.
3. **Seed products are unpublished.** The website shows no seeded products, and the distributor and consultant catalogues are empty, until you publish them in **Website** or run the catalogue import. Distributor orders fail otherwise.
4. **No dispatches are seeded.** Create one through the API before demonstrating dispatch.
5. **The dispatch status filter lists PLANNED**, but real dispatches start at **PICK_LIST**. Ignore the PLANNED filter value.
6. **Shop floor shortcuts:**
   - **Pause** always logs 15 minutes of downtime.
   - **Complete** always records the full required quantity.
   - **Report issue** saves a fixed note, "Reported from the floor", with no text box.
7. **Expense claims:** only users linked to an employee record can file one (sales@ and site@ in the seed), but their roles lack `expenses.create`. Grant it first (file 9, section 9.5).
8. **Approval roles without demo users:** no seeded user is `sales_manager` or `engineering_head`. Approve quotations under 10% and engineering client approvals as **md@** or **admin@**.
9. **You can't approve your own request.** If saleshead@ submits a quotation, approve it as md@.
10. **Alerts for delayed projects go to `project_manager`**, but no demo user has that role, so nobody sees those alerts in the demo. MD has a seeded notification about ABC Data Center.
11. **Approval "Open record" links for purchase orders and expenses** open the list page, not the specific record.
12. **Technical Submittals:** viewing needs `documents.view`, but **New submittal** needs `engineering.create`.
13. **The Help (?) icon** in the ERP top bar does nothing.

## 13.3 Portal gaps

1. **No file uploads** anywhere in customer-facing flows: portal RFQs, tickets, engineering requests, and website RFQ or contact forms. Visitors mention BOQ or drawing references in text instead.
2. **Customers can only accept** a quotation. There is no reject or request-changes button; negotiation happens offline.
3. **Accepting a quote does not create the order automatically.** Fixotec staff click **Create sales order**. This is by design, as a control step.
4. **Consultants cannot approve** engineering drawings ("Your approval" step) or submittals in the portal.
5. **The `contractor` role** gets the contractor menu but lacks the permissions for Accept, Invoices, Deliveries and Support, so those pages error. Use the `customer` role for contractor companies.
6. **The portal notification bell** only shows a red dot; clicking it does nothing.
7. **There is no invoice PDF download** in the portal, and no proof-of-delivery file.
8. **No self-registration or forgot-password.** Fixotec creates accounts.

## 13.4 Website gaps

1. `/configure` (System finder) and `/projects` are **not linked in the navigation**. Type the URL.
2. The visitor is not shown their enquiry reference number.
3. Careers has no application form, only mailto links.

## 13.5 Roadmap items from the architecture document (not built)

Don't present these as live. Present them as the planned phases:

- **Mobile apps:** sales, site, warehouse and production apps. The ERP is responsive, and the shop floor screen is tablet-friendly.
- **WhatsApp, SMS and push notifications.** Today there is in-app and email only. WhatsApp is just a lead-source option.
- **Barcode and QR scanning**, bin putaway and picking, cycle counting, stock ageing.
- **A visual production planning board, and OEE.**
- **Payroll integration, attendance and leave screens.**
- **Advanced AI:** open-ended chat, document search, sales forecasting beyond the simple 6-month average.
- **Payment gateway, logistics APIs, Autodesk and Revit integration.**
- **Digital signatures** on documents, and client signature capture on site.
- **OpenSearch-style full-text search.**
- **Configurable approval rules through a UI.** Rules exist in the database and API, but there is no screen for them yet.

## 13.6 Golden rules for the demo

1. Re-seed before the demo, and rehearse the exact script.
2. Publish products before showing the website or the distributor catalogue.
3. Use ERP-created RFQs with catalogue lines for anything that gets priced.
4. Keep an **md@** window open for approvals.
5. Pre-create the dispatch through Swagger.
6. Stay on the happy path. When asked about a missing screen, say: "That's built in the API and the screen comes in the next phase. Here is how the flow works."
