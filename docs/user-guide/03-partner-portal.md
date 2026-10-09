# 3. Partner portal (http://localhost:3001)

The **FIXOTEC Partner Portal** ("For contractors, distributors and consultants") is the self-service app for Fixotec's external partners. It is **one app with three different menus**, chosen automatically from the user's role. Code: `apps/portal`.

| User's role | Portal type | Label in top bar | Demo login |
|---|---|---|---|
| `customer` or `contractor` | Contractor (customer) portal | "Contractor" | customer@apexmep.example |
| `distributor` or `dealer` | Distributor portal | "Distributor" | distributor@westline.example |
| `consultant` | Consultant portal | "Consultant" | consultant@northstar.example |

The password for all three is `ChangeMe!234`.

## 3.1 Signing in

1. Open http://localhost:3001. You are sent to `/login`.
2. Enter your **Email** and **Password**, then click **Sign in**.
3. If the account has **two-step verification** turned on, enter the 6-digit **Authenticator code** from your authenticator app, or a recovery code, and click **Verify**. **Use a different account** goes back to step 2.
4. You land on the Dashboard, or on the page you originally tried to open.

**Things to know:**
- **No self-registration** and no "forgot password". The login page says "Use the account Fixotec created for your organisation." Fixotec staff create portal users in the ERP: **Users > Invite user**, type EXTERNAL, linked to a customer.
- **Staff accounts are refused** here. They see "Staff accounts use the ERP" and a **Sign out** button.
- **Sessions last 8 hours.** A warning appears near the end. After it expires you see "Your session has expired. Please sign in again."
- **Lockout:** 5 wrong passwords lock the account temporarily.
- Opening a page outside your menu shows "Access denied".

## 3.2 Features every portal type shares

- **Sidebar:** Fixotec logo, your organisation name, your menu (it can be collapsed) and **Sign out**.
- **Search** (top bar): a command palette that searches your projects, RFQs, quotations, orders, products and documents, with "Go to" quick links.
- **Notification bell:** shows a red dot when you have unread notifications. Clicking it does nothing yet; see file 13.
- **User menu:** **Sign out**.
- **Activity feeds** on dashboards and detail pages, with links to the related record.
- **Demo banner:** "Demo environment. Prices, stock, customers and orders are sample data."

---

## 3.3 Contractor / customer portal

**Menu:** Dashboard, Projects, RFQs, Quotations, Orders, Deliveries, Invoices, Documents, Downloads, Support.

### Dashboard `/`
- A greeting with your first name and today's date.
- **Stat cards:** Active projects, Open RFQs, Pending approvals ("Quotations and drawings for your review"), Orders in transit.
- **Your projects:** cards with cover image, name, location, health (On Track, At Risk or Delayed), progress bar, next milestone and completion date. Click a card to open the project.
- **Quick actions:** **Request a quotation** (opens a new RFQ), **Review quotations**, **Track deliveries**.
- **Recent activity.**

### Projects `/projects`
- **Stat cards:** Total, Active, Quoted, Completed.
- **Tabs:** All Projects, Active, Quoted, Completed, Lost.
- **Search**, **Sort** (Latest, Name, Value), a **Grid/List** switch, and 24 projects per page.
- **Each card:** cover image, stage chip, name, location, project ID, progress (active projects only), stage, start and end dates, value (in ₹ Cr or L) and notes.
- **Card actions:** **View Details**, and a "⋯" menu with **Open project** and **Copy project ID**.
- **New RFQ** button.
- **Project stages:** IDENTIFIED, RFQ, ENGINEERING, QUOTED, NEGOTIATION, WON, EXECUTION, CLOSED, LOST.

### Project detail `/projects/[id]`
- **Header:** cover image, name and code, health, customer, location, dates, and "Fixotec scope" value.
- **Buttons:** **Request quotation** (opens a new RFQ already linked to this project) and **Documents**.
- **Tabs:**

| Tab | What it shows |
|---|---|
| Overview | Milestone stepper (Done, In progress, Blocked, Upcoming); Project health (progress %, timeline, open site issues, next milestone); recent activity; key contacts with email links |
| RFQs | Number, status, created date, value. Click a row to open it |
| Quotations | Number, status, created date, value. Click a row to open it |
| Orders | Number, status, created date, value. Click a row to open it |
| Documents | File tiles with thumbnail, revision and size. Click a tile to download |
| Activity | Full history |

### RFQs `/rfqs`
- **Stat cards:** Total, In Review, Quoted, Ordered.
- **Tabs:** All, Received, In review, Quoted, Ordered.
- **Columns:** RFQ, Project, Application, Lines, Sent, Status.
- **New RFQ** button.

#### How to submit an RFQ (`/rfqs/new`)
1. Click **New RFQ**, or **Request quotation** on a project.
2. Under **Requirement lines**, fill in each line:
   - **Description**: required on the first line, up to 500 characters.
   - **Qty**.
   - **Unit**: NOS, SET, MTR, KG or LOT.
   - **Specification** (optional): finish, load and so on.
3. Click **Add line** for more items. The trash icon removes a line.
4. In the **Details** panel, fill in:
   - **Project**: pick one, or leave "Not linked to a project".
   - **Application**: for example HVAC, fire or plumbing.
   - **Priority**: Low, Medium, High or Urgent.
   - **Needed by**: a date.
   - **Notes**.
5. Click **Submit RFQ**. The RFQ is created with status **Received**, and the RFQ page opens. You cannot attach files.

Portal RFQ lines are free text and are not linked to catalogue articles. If Fixotec generates a quotation straight from this RFQ, those lines are priced at zero. Fixotec staff normally re-enter the items in the ERP with the catalogue picker. See file 13.

#### RFQ detail `/rfqs/[id]`
- **Header:** title, status, project link, sent date, "Handled by \<Fixotec person\>", and quoted value.
- **Progress stepper:** Received → Engineering Review → BOQ → Pricing → Approval → Quoted → Negotiation → Won. A lost RFQ shows the last step as blocked.
- When a quotation is ready, a banner says "Quotation QT-xxxx is ready. **Review it**".
- **Tabs:**
  - Requested items, with a Details card showing Priority, Needed by, Application and Notes.
  - Quotations. If there are none yet: "Our team is preparing your quotation".
  - Documents.
  - Activity.
- You **cannot edit** an RFQ after submitting it.

### Quotations `/quotations`
- **Stat cards:** Total, Awaiting You, In Negotiation, Accepted.
- **Tabs:** All, Awaiting you, In negotiation, Accepted.
- **Columns:** Quotation ("For RFQ-xxx"), Project, Issued, Valid until, Status, Total.
- You only see quotations that Fixotec has actually **sent** to you, which means statuses SENT, NEGOTIATION, ACCEPTED or COMPLETED. Internal drafts and approvals stay hidden.

#### How to accept a quotation (`/quotations/[id]`)
1. Open a quotation with status **Sent**.
2. Review it:
   - **Lines:** Item and article number, Qty, Rate, GST %, Amount.
   - **Summary:** Subtotal, Discount %, Freight, GST, Total.
   - **Terms:** Payment, Delivery, Currency, Issued date.
3. Click **PDF** to download the formal quotation.
4. Click **Accept quotation**. It only appears if the quote is Sent or in Negotiation and hasn't expired.
5. Confirm in the box "Accept this quotation?". It explains: "Fixotec will be notified and will raise the sales order at the quoted prices." Click **Accept**.
6. The status becomes **Accepted**, and every Sales Head at Fixotec gets a notification. The page shows "You accepted this quotation on \<date\>…".
7. Once Fixotec creates the order, the page shows "Ordered as SO-xxxx" with a link to it.

Other notices:
- **Expired:** "Ask your Fixotec contact for a revised offer."
- There is **no Reject or Request changes button**. Negotiation happens with your Fixotec contact.

### Orders `/orders`
- **Stat cards:** Total, Confirmed, Dispatched, Closed.
- **Tabs:** All, Confirmed, Partially shipped, Dispatched, Closed.
- **Columns:** Order ("From QT-xxx"), Project, Placed, Shipments, Status, Value.
- **Order detail** (read-only):
  - **Header:** project, source quotation, placed date, value and a **Shipped %** bar.
  - **Lines tab:** Item, Ordered, Shipped, Rate, Amount, plus a summary.
  - **Shipments tab:** Dispatch, Status, Transporter and LR number, Shipped date, Delivered date.
  - **Invoices tab:** Invoice, Issued, Due, Status, Total.

### Deliveries `/deliveries`
- **Stat cards:** Preparing, In transit, Delivered.
  - Delivered means the shipment has a delivered date.
  - In transit means it has a shipped date but no delivered date.
  - Preparing means neither.
- **Tabs:** All, In transit, Delivered, Preparing.
- **Search** by dispatch number, order or LR number.
- **Columns:** Dispatch, Order, Lines, Transporter (with LR number and vehicle number), Shipped, Delivered, Status.

### Invoices `/invoices`
- **Stat cards:** Invoiced, Outstanding, Overdue.
- **Tabs:** All, Open (balance left to pay), Overdue (past due with a balance), Paid.
- **Columns:** Invoice, Issued, Due (red if overdue), Total, Balance, Status.
- There is no invoice PDF download yet.

### Documents `/documents`
- Every document shared with your company.
- **Category tabs** and **Search**.
- **Columns:** Document, Type, Rev, Size, Updated, and a download icon.
- You only see document versions that are **Approved** or in **Client review**.

### Downloads `/downloads`
The technical file library:
- **Tabs:** All, CAD, BIM, Drawings, Datasheets, Installation.
- **Search.**
- A tile grid. Click a tile to download.

### Support `/support`
- **Tabs:** Open, Resolved, All.
- **Columns:** Ticket, Subject, Priority, Raised, Response by (the response deadline, called the SLA), Status.

#### How to raise a support ticket
1. Click **New ticket**.
2. Fill in:
   - **Subject**: required, at least 3 characters.
   - **Priority**: Low, Medium, High or Critical.
   - **Project**: optional.
   - **What happened?**
3. Click **Raise ticket**. The response deadline is calculated from the priority:

| Priority | Fixotec responds within |
|---|---|
| Critical | 4 hours |
| High | 8 hours |
| Medium | 24 hours |
| Low | 48 hours |

4. Click a ticket to open its drawer: status, priority, assignee, description and a **Conversation** thread, labelled "You" or "Fixotec".
5. Type a reply and click **Send**.

Closed tickets cannot receive replies. Customers cannot close tickets or attach files.

---

## 3.4 Distributor portal

**Menu:** Dashboard, Catalogue, Price list, Availability, Orders, Invoices, Targets, Schemes, Marketing.

### Dashboard `/`
- **Stat cards:** Orders, Outstanding (invoiced minus paid), Target achieved % (current period), Active schemes.
- **Recent orders** table: Order, Placed, Status, Value. It has a **New order** button.
- **Quick actions:** **Browse catalogue**, **Check availability**, **Claim a scheme**.

### Catalogue `/catalogue`
Portal users only see products that are **published** (ERP **Website** > Products > **Published on website**). Every seeded product starts unpublished, so publish some first or the catalogue, price list and ordering will be empty.

- Search by name, SKU or article number. 24 products per page.
- **Each card:** image, family badge, SKU, name, number of variants, and **"from ₹…"** (your price).
- **Product page `/catalogue/[id]`:**
  - **Header:** image, family, category and lead time, plus an **Order** button.
  - **Variants tab:** Article, Variant and attributes, **Your price**, and **Add to order** on every row.
  - **Specifications tab:** description, technical description, applications, and Technical data (Material, Finish, Load capacity, Pipe size, Pack size, MOQ).
  - **Technical files tab:** downloadable documents.

### Price list `/prices`
- "Net prices on your \<DEALER\> price list, before GST."
- Search, 25 per page, and a sortable **Price** column.
- **Columns:** Article, Product, Variant and attributes, Price.
- Click a row to open the product.

### Availability `/stock`
- **Availability bands** instead of exact quantities, so competitors can't learn real stock levels:

| Band | Meaning |
|---|---|
| AVAILABLE | In stock |
| LIMITED | Below safety stock |
| OUT_OF_STOCK | Out of stock (bought-in item) |
| MADE_TO_ORDER | Out of stock, but manufactured on demand |

- Tabs with counts per band, and search.
- **Columns:** Article, Description, Availability, and an **Order** button.
- Page note: "Exact quantities are confirmed on order."

### How to place an order (`/orders/new`)
1. Click **New order**, or **Order** / **Add to order** from the catalogue or availability page. That article is added automatically.
2. Under **Find articles**, type at least 2 characters of a name, SKU or article number. Click **Add** on a result. Each result shows your price.
3. In **Order lines**, adjust each **Qty**. The remove button deletes a line.
4. Check the **Summary**: article count, Subtotal, "GST: Calculated on the order".
5. Click **Place order**.

What happens next:
- Prices are always taken from your price list on the server, so a price can't be changed in the browser.
- A **credit check** runs. If your unpaid invoices plus this order exceed your credit limit, the order goes on **Credit hold** until Fixotec Finance releases it.
- A **stock check** runs. Short items are **backordered**, which automatically starts production or purchasing at Fixotec.
- The order opens, with status **Confirmed**, **Backordered** or **Credit hold**.

### Orders and Invoices
These work the same as the contractor portal (section 3.3). Distributors also see the **New Order** button.

### Targets `/targets`
- **Stat cards:** Total target, Achieved, Overall %.
- One card per period: metric, %, "₹ to go" or "Target met", a progress bar, and achieved vs target.
- Read-only. Fixotec sets the targets.

### Schemes and claims `/schemes`
1. Each scheme card shows its name, description and validity ("Open-ended" if it has no dates). The demo has "Rail volume Q4".
2. Click **Submit claim**.
3. Enter the **Claim amount** (required, at least 1) and **Notes** (for example invoice numbers or period covered).
4. Click **Submit claim**. You see "Claim submitted for X". The scheme must be active and within its dates.
5. The **Your claims** table shows Scheme, Submitted, Notes, Status and Amount. Fixotec reviews claims against your invoiced sales.

### Marketing `/documents`
Marketing material (brochures, catalogues) to download, filtered to the MARKETING category.

---

## 3.5 Consultant portal

**Menu:** Dashboard, Projects, Requests, BOQ, Submittals, Products, CAD / BIM, Technical files.

Consultants specify Fixotec products in project designs, so their portal is technical and shows **no prices**.

### Dashboard `/`
- **Stat cards:** Projects, Open requests, BOQs, Submittals.
- **Engineering requests** table: Request, Project, Application, Status.
- Recent activity and a "Your projects" grid.

### Projects
The same as the contractor portal, but without the RFQ button. Consultants see projects where they are the consultant or a project member.

### How to send an engineering request (`/engineering`)
1. Click **New request**.
2. Fill in:
   - **Project** (optional)
   - **Application** (required): for example pipe support or cable tray
   - **Required system**: for example strut, seismic or trapeze
   - **Load**: for example 2.5 kN per support
   - **Dimensions**
   - **Material**
   - **Standard**: for example IS, ASCE or NFPA
   - **Installation condition**
   - **Needed by**
   - **Notes**
3. Click **Send request**. Fixotec Engineering sees it in the ERP Engineering queue.

**Request list:** status tabs, search, and columns Request, Project, Application and system, Engineer (or "Unassigned"), Due, Status.

**Request detail `/engineering/[id]`:**
- **Stepper:** Received → Review → Calculation → Drawing → **Your approval** → Approved. A rejected request shows "Rejected".
- **Design inputs:** what you submitted.
- **Drawings and calculations:** files from Fixotec engineers to download, showing their revision status.
- **Activity.**
- There is no approve button for the "Your approval" step in the portal; see file 13.

### BOQ `/boq`
- **List columns:** BOQ number and title, Project, Lines, Matched (x/y), Created, Status.
- **BOQ detail:**
  - **Stat cards:** Lines, Matched to articles, Needs review.
  - **Table:** #, Description, Qty and unit, Fixotec article (or "Unmatched").
- Read-only.

### Submittals `/submittals`
- **Tabs:** All, For review, Approved, Approved as noted, Rejected.
- **Columns:** Submittal, Title, Project, Contents (N products · N documents), Status, Issued.
- Click a row to open a drawer showing status, project, products, documents and every revision, with a **Download** button for each. Each revision is a compiled technical submittal PDF.

### Products, CAD / BIM and Technical files
- **Products** (`/catalogue`): the catalogue with specifications and technical files, **without prices**.
- **CAD / BIM** (`/cad`): tabs for All, CAD, BIM and Drawings.
- **Technical files** (`/downloads`): adds Datasheets and Installation guides.

## Practice exercise

1. **As the customer:**
   - Open the project "ABC Data Center" and look at its milestones.
   - Submit a 2-line RFQ.
   - Raise a High-priority support ticket and reply to it.
2. **As the distributor:**
   - Check the price of FXR-4141-20.
   - Look at its availability band.
   - Place an order for 20 pieces.
   - Submit a claim on "Rail volume Q4".
3. **As the consultant:**
   - Send an engineering request for a seismic support at 2.5 kN.
   - Open a submittal and download it.
4. **In the ERP:** find all three new records: the RFQ under RFQs, the order under Orders, and the engineering request under Engineering.
