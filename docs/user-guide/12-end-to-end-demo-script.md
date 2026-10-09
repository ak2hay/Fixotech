# 12. End-to-end demo script

A rehearsable script for demonstrating Fixotec ONE. Each step lists the **app**, the **login**, the **URL**, **what to click**, and **what to say**. Rehearse it at least twice on a freshly seeded database (file 0, section 0.5).

Password for every login: `ChangeMe!234`.

## 12.0 Before the demo (checklist)

- [ ] Re-seed the database, so new numbers start at 0200 and the data is clean.
- [ ] `pnpm dev` is running. Check http://localhost:3000, http://localhost:3001 and http://localhost:3002, and the API (`<api-url>/api/v1/health/ready`).
- [ ] Use **one browser profile per login** (or separate Chrome profiles or incognito windows), so you don't have to sign out and back in all the time. Suggested windows:
  1. Website (no login)
  2. ERP as `saleshead@demo.fixotec.test`
  3. ERP as `md@demo.fixotec.test` (incognito)
  4. Portal as `customer@apexmep.example` (second profile)
  5. ERP as `admin@demo.fixotec.test` (third profile, for operations steps)
- [ ] **Publish products.** All seed products are unpublished. Until you publish them, the website shows no seeded products, the distributor and consultant **catalogue and price list are empty**, and distributor orders fail with "Article is not in the catalogue". As admin, open **Website** (`/content`) and tick **Published on website**, then **Save product**, for at least **FXR Mounting Rail**, **FXR Connector** and **SRS Heavy Clamp**. Alternatively, run the real catalogue import (`pnpm import:fixotec:crawl`, then `pnpm import:fixotec:load`) beforehand.
- [ ] Swagger open at `<api-url>/api/docs`, for the dispatch step (section 12.8).
- [ ] Zoom the browser to about 110% for the projector.
- [ ] Read file 13 (limitations) so you know which buttons not to click.

## 12.1 Opening (2 min): the big picture

Show the system map from the [README](README.md) and say:

> "Fixotec ONE is one platform with three doors: a public website for prospects, a partner portal for contractors, distributors and consultants, and an internal ERP for Fixotec staff. Everything runs on one database, so a website enquiry, a quotation, a production job and an invoice are all connected records, with no re-typing and no spreadsheets."

The core story is: **Lead → RFQ → Engineering → Quotation → Approval → Customer acceptance → Sales order → Production / Purchase → QC → Dispatch → Invoice**.

## 12.2 Website: a prospect sends an enquiry (4 min)

**App:** website http://localhost:3000. **Login:** none.

1. Show the home page: hero, segments, sectors, engineering section, technical library.
2. Open **Products**, then the FXR Mounting Rail page. Point out the spec table, the variants table with filters, and the datasheets. Say: "No prices are shown publicly; pricing goes through the RFQ."
3. Filter the variants by section and thickness, enter a **Qty** on two variants and click **Add**. The basket icon counter goes up.
4. Optional: open `/configure` (System finder). Choose Pipes, 100 mm, HVAC, Ceiling, and click **Find system**, then **Add all to RFQ**.
5. Click the basket (**Request a quote**). Fill in Full name, Company ("Demo Prospect Pvt Ltd"), Email, Project name ("Metro Mall"), Application (HVAC), then click **Submit RFQ**.
6. Say: "That has just created a lead and an RFQ inside the ERP, and notified the Sales Head."

## 12.3 ERP: the Sales Head sees it (3 min)

**App:** ERP. **Login:** `saleshead@demo.fixotec.test`.

1. Point out the **notification bell**: "Website enquiry: Demo Prospect Pvt Ltd sent LD-0200…".
2. Open **Leads**. LD-0200 has source WEBSITE and status RFQ.
3. Open **RFQs**. The new RFQ (RFQ-0200) has status Received, with the basket lines matched to catalogue articles.
4. Say: "Before we can quote, sales qualifies the prospect and links them to a customer account. To keep moving, I'll quote an existing customer, Apex MEP."

A website RFQ has no customer attached, and a quotation needs one. That's why the commercial flow continues with an RFQ created in the ERP for an existing customer. See file 13.

## 12.4 ERP: create and price an RFQ (5 min)

**Login:** `saleshead@`.

1. **RFQs → New RFQ**:
   - Customer **Apex MEP Contractors**
   - Project **ABC Data Center**
   - Application "HVAC supports"
   - Priority High
2. Add catalogue lines with the product picker:
   - **FXR-4141-20**, qty **100**, unit M or NOS
   - **CON-4141**, qty **200**

   These quantities are in stock, so the order will be Confirmed later.
3. **Save**, which opens RFQ-0201.
4. Optional: **Request engineering review**. Enter Application, Required system "Trapeze", Load "2.5 kN", Standard "IS". Say: "Technical RFQs go to engineering first; the RFQ status changes to Engineering required." The engineering side is shown in section 12.10.
5. Click **Generate quotation**: Discount **12**%, Freight 2000, Valid for 15 days, then submit. The quotation QT-0200 opens as **DRAFT**. Prices come from Apex's CUSTOMER price list.
6. Show the **line items**, **Summary** and **Margin**. Margin is visible because the Sales Head has cost permission; it turns red below 15%.

## 12.5 Approval workflow (3 min)

1. Still as `saleshead@`, click **Submit for approval**. The status becomes Under review.
2. Say: "Approval rules are configurable. Under 10% goes to the Sales Manager, 10-20% to the Sales Head, 20% and above to the MD. And nobody can approve their own quotation."
3. Switch to the **md@** window. Open **Approvals** (note the badge). The QT-0200 card shows the value and the 12% discount.
4. Type the **Decision note** "Approved for strategic account" and click **Approve**.
5. Back as `saleshead@`, refresh QT-0200. It is **APPROVED**. Click **PDF** to show the formal quotation, then click **Send to customer**. The status becomes **SENT**.

Optional: also show the seeded QT-0100 card in `saleshead@`'s Approvals. It is waiting for the Sales Head.

## 12.6 Portal: the customer accepts (3 min)

**App:** portal http://localhost:3001. **Login:** `customer@apexmep.example`.

1. Show the **Dashboard**: active projects, open RFQs, pending approvals, the project cards with health and progress.
2. Open **Projects → ABC Data Center**. Show the milestones, health, documents and key contacts.
3. Open **Quotations**. QT-0200 is under "Awaiting you". Open it and show the lines, summary and terms, and download the **PDF**.
4. Click **Accept quotation**, then **Accept**. You see "You accepted this quotation on…".
5. Say: "The Sales Head has just been notified. The customer never sees internal drafts, costs or approvals, only what we sent them."

## 12.7 ERP: create the sales order (2 min)

**Login:** `saleshead@`.

1. Show the notification "Quotation accepted…". Open QT-0200; it shows "Customer accepted on…".
2. Click **Create sales order** and confirm. SO-0200 opens.
3. Explain the automatic checks:
   - **Credit:** Apex's unpaid invoices plus this order are within the ₹25 lakh limit, so there is no hold.
   - **Stock:** enough free stock, so the order is **CONFIRMED**.
4. Optional backorder demo: create another RFQ, quotation and order for **SRS-HVY-100** with qty **100** (only 40 in stock). The order is **BACKORDERED**, and the system automatically raises a production order or purchase requisition for the shortfall. Show it in **Production** or **Purchases**.

## 12.8 Dispatch and invoice (4 min)

The ERP has no button for *creating* a dispatch (pick list) yet; see file 13. Create the pick list through Swagger *before* this part of the demo, then show the rest in the ERP.

**Creating the pick list in Swagger** (`<api-url>/api/docs`):
1. `POST /api/v1/auth/login` with `{"email":"admin@demo.fixotec.test","password":"ChangeMe!234"}`. Copy the `accessToken`.
2. Click **Authorize** and paste the token.
3. `GET /api/v1/warehouses`: copy the WH-PUN `id`.
4. `GET /api/v1/sales-orders`: find SO-0200 and copy its `id`. Then `GET /api/v1/sales-orders/{id}` and copy each line's `id` (`items[].id`).
5. `POST /api/v1/dispatch` with:
   ```json
   {
     "salesOrderId": "<SO id>",
     "warehouseId": "<WH-PUN id>",
     "items": [
       { "salesOrderItemId": "<line 1 id>", "qty": 100 },
       { "salesOrderItemId": "<line 2 id>", "qty": 200 }
     ]
   }
   ```
6. The response is DSP-0200 with status PICK_LIST.

**In the ERP** (login `admin@` or `warehouse@`; shipping needs `dispatch.approve`, which admin has):
1. Open **Dispatch → DSP-0200** and click **Mark picked**. The status becomes PICKING.
2. Click **Ship**: Transporter "VRL Logistics", LR number "LR-55821", E-way bill "EWB-1234567890", Vehicle "MH12AB1234". The status becomes **SHIPPED**.
3. Say: "Stock was deducted from finished goods automatically, and the order lines are marked shipped." Show **Inventory**: FXR-4141-20 has dropped by 100.
4. Click **Raise invoice**. INV-0200 is created with status ISSUED, due in 30 days.
5. Click **Record delivery** with the proof note "Received by site store, signed".
6. **Portal (customer@):**
   - **Deliveries** shows DSP-0200 Delivered, with transporter and LR number.
   - **Invoices** shows INV-0200 with its balance.
   - **Orders → SO-0200** shows Shipped 100%.

## 12.9 Management view (3 min)

**Login:** `md@`.

1. **Overview:** the revenue, orders, pipeline and receivables cards, today's actions, the pipeline funnel and the operations card.
2. **Analytics:** RFQ-to-order %, revenue by customer, project margin, and the demand forecast.
3. **Assistant:** ask "Why is ABC Data Center delayed?" (open site issue, overdue completion) and "Which products are below safety stock?".
4. **Audit Log:** every action you just did, with actor, time and IP. Say: "Every discount change, approval and stock movement is traceable."

## 12.10 Shorter feature demos (pick based on audience)

### A. Distributor self-service (4 min)
**Portal login:** `distributor@westline.example`.
1. **Dashboard:** orders, outstanding, target %, schemes.
2. **Price list:** net dealer prices. **Availability:** bands, not quantities.
3. **Catalogue → FXR Mounting Rail → Add to order** on a variant, set qty 20, click **Place order**. The order arrives in the ERP under Orders, marked "Portal".
4. **Targets:** progress. **Schemes → Rail volume Q4 → Submit claim**: ₹5,000, note "Oct invoices".

### B. Consultant and engineering (5 min)
1. **Portal login:** `consultant@northstar.example`. Go to **Requests → New request**: Application "Seismic pipe support", Load "2.5 kN", Standard "ASCE 7". Click **Send request**.
2. **ERP login:** `engineer@`. Open **Engineering**, find the new request, click **Update**, and set status CALCULATION, then DRAWING. Upload a PDF calculation.
3. Set status **CLIENT_APPROVAL**, then approve it as `md@` in **Approvals**. (No demo user is Engineering Head.)
4. Back in the consultant portal, the stepper has moved and the drawing can be downloaded.
5. Optional: **Technical Submittals → New submittal** (ERP, as `admin@`): choose the project, tick documents and variants, click **Compile PDF**. The consultant sees it under **Submittals**.

### C. BOQ to RFQ (3 min)
**ERP login:** `saleshead@` or `engineer@`. Go to **BOQ → Import BOQ** and upload a CSV (example in file 6). Show the matched lines, then click **Convert to RFQ**.

### D. Shop floor and quality (4 min)
1. **ERP login:** `production@`. Open **Shop Floor**, then JOB-0100: click **Start**. Raw material is issued automatically from the BOM. Then **Pause**, **Start** again, and **Complete**.
2. **Login:** `qc@`. Open **Quality**, find the new final inspection, click **Record decision → ACCEPTED**. Stock is posted to FG. Or choose **REJECTED**, which creates an NCR automatically. Open it and fill in **Update CAPA** with root cause and corrective action.

### E. Site and service (3 min)
1. **Login:** `site@`. Open **Site Execution → Raise issue** on ABC Data Center with **Material shortage** ticked.
2. **Portal login:** `customer@`. Open **Support → New ticket**, priority Critical. The response deadline is 4 hours. Reply in the conversation.
3. **ERP login:** `admin@`. Open **Service**, find the ticket and update its status.

### F. Website CMS (3 min)
**ERP login:** `admin@`. Open **Website → Products**, pick a product, edit a feature line, add a photo, tick **Published**, and click **Save product**. Add a datasheet and **Approve** it as a different user. Refresh the website within 5 minutes.

### G. Security and administration (3 min)
**ERP login:** `admin@`.
1. **Users → Invite user**: an EXTERNAL user for Apex with role `customer`.
2. **Roles:** show the permission matrix.
3. Sign in as `sales@` to show that menus are hidden and Approvals is denied.

## 12.11 Timing guide

| Demo length | Include |
|---|---|
| 15 minutes | 12.1, 12.2, 12.4 to 12.7 (short), 12.9 |
| 30 minutes | 12.1 to 12.9 |
| 45 to 60 minutes | Everything, plus 2 or 3 short demos from 12.10 that match the audience (management: 12.9 and G; engineering: B and C; operations: D and E; channel sales: A) |

## 12.12 Closing lines

> "What you've seen is one connected system: a prospect's website enquiry, an engineered quotation with controlled approvals, customer self-service acceptance, automatic credit and stock checks, production and QC, dispatch and invoicing, all visible to management in real time and fully audited. The next phases connect deeper procurement screens, mobile site and warehouse apps, WhatsApp notifications and accounting sync."

## 12.13 If something goes wrong live

| Problem | Recovery |
|---|---|
| A button is missing | You're signed in with the wrong role. Switch to `admin@` |
| "You cannot approve your own request" | Approve from the `md@` window |
| "RFQ needs a customer before it can be priced" | It is a website RFQ. Use an ERP-created RFQ (12.4) |
| Ship fails with a stock error | Use items with FG stock: FXR-4141-20, CON-4141 or SRS-HVY-100 (max 40) |
| Job start refuses (material short) | Say "the system blocked production because raw material is short", then show Inventory |
| Accept button missing in the portal | The quotation isn't SENT yet, or it has expired |
| Session expired | Sign in again; sessions last 8 hours |
