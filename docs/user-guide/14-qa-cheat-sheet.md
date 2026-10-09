# 14. Q&A cheat sheet: questions the client may ask

Short, honest answers. **Built** means it works in the code today. **Roadmap** means it is planned.

## Product and scope

**1. What is Fixotec ONE in one sentence?**
One connected platform (website, partner portal and ERP) that runs Fixotec's business from enquiry to invoice, built around engineering-led selling of MEP support systems.

**2. How is this different from Tally, Zoho or a generic ERP?**
Generic ERPs handle accounting and basic sales. Fixotec ONE is built for an engineered product business:
- Engineering requests and approvals.
- BOQ import and matching to the catalogue.
- Technical submittals compiled as PDF.
- CAD and BIM document control.
- Variant-level products (section and thickness) with four price lists.
- Partner portals.

It works alongside Tally or Zoho for accounting instead of replacing them.

**3. Which modules are live today?**
- CRM: leads, customers, projects.
- RFQs, quotations with approvals, sales orders with credit and stock checks.
- Engineering requests, BOQ, product library, CAD/BIM, submittals, documents.
- Vendors, purchases, warehouses, inventory, dispatch.
- Production, shop floor, quality, NCR.
- Site issues, service tickets, invoices, expenses.
- Analytics, assistant, website CMS, users, roles, audit.
- Plus the website and three portals.

Some create screens (purchase orders, goods receipts, dispatch creation) are API-only for now (file 13).

**4. What is the recommended rollout?**
In phases:
1. Foundation and sales: CRM, RFQ, quotation, order, customer portal.
2. Engineering.
3. Procurement and inventory.
4. Manufacturing.
5. Projects and site.
6. Finance integration.
7. Analytics and AI.

The first pilot focuses on **RFQ → Engineering → BOQ → Quotation → Order**.

## Sales and commercial

**5. Can discount approvals follow our policy?**
Yes. Approval rules are data, not code. The defaults are: under 10% goes to the Sales Manager, 10-20% to the Sales Head, 20% or more to the MD. Rules can use any threshold and role. A rule-editing screen is **Roadmap**; today rules are changed through the API.

**6. Can a salesperson see our cost and margin?**
Only roles with `products.view_cost` (Sales Head, Production Manager, management) see cost and margin. Margin below 15% is highlighted in red.

**7. Does each customer get their own prices?**
Yes. Every variant has Standard, Customer, Dealer and Export prices, and each customer is assigned a price list. Distributors see only their own net prices.

**8. What happens if a customer is over their credit limit?**
The sales order goes to **Credit hold** automatically. Only Finance Head, MD or Admin (`customers.override`) can release it.

**9. What if we don't have stock?**
The order is **Backordered**, and the system automatically creates a production order (for manufactured items) or a purchase requisition (for bought-in items) for the shortfall.

**10. Can customers accept quotations online?**
Yes. In the portal they review, download the PDF and click **Accept**. Sales is notified immediately. They only see quotations that have been approved and sent.

**11. How do website enquiries reach sales?**
Every website RFQ or contact form creates a **Lead** (source WEBSITE). RFQs also create an **RFQ** with the basket items. Sales Heads are notified instantly. The form has spam protection.

## Engineering

**12. Can we import a contractor's BOQ?**
Yes. CSV or Excel import matches lines to catalogue articles by article number or name, shows a matched count, and converts to an RFQ in one click. PDFs are stored for reference and entered manually; automatic PDF reading is **Roadmap**.

**13. How are drawings controlled?**
Every document has versions: Draft → Internal review → Client review → Approved. Approved versions are frozen, nobody can approve their own upload, and customers only see approved or client-review versions.

**14. Can we generate technical submittals?**
Yes. Pick a project, the documents and the product variants, and Fixotec ONE compiles one PDF. It is shared automatically with the customer and consultant portals.

**15. Can consultants request engineering support?**
Yes. The consultant portal has engineering requests with load, standard, material and dimensions. They can follow progress and download drawings. Approving inside the portal is **Roadmap**.

## Operations

**16. How is inventory kept accurate?**
Nobody edits stock numbers directly. Every movement is a transaction (receipt, production, dispatch, transfer, adjustment), so there is a full audit trail. Stock can't go negative without override permission. Valuation is weighted-average cost.

**17. When does purchased material count as stock?**
Only after **incoming QC accepts it**. A goods receipt creates inspections first. A rejection creates an NCR automatically.

**18. How does production use raw material?**
When an operator starts a job card, the system works out material from the BOM (including scrap and yield) and issues it from the raw-material bin. It refuses to start if material is short.

**19. Do you support batch traceability?**
Stock positions carry batch numbers, and QC inspections link to batches, goods receipts and production orders. Heat numbers, coating batches and full lot genealogy are **Roadmap**.

**20. Can we track dispatches and transporters?**
Yes. Each dispatch records transporter, LR number, e-way bill reference, vehicle number, ship and delivery dates, and a proof-of-delivery note. Customers see this in the portal. Partial dispatches are supported.

**21. Can operators use tablets?**
The Shop Floor screen is designed for tablets, with large Start, Pause, Complete and Report issue buttons. Native mobile apps are **Roadmap**.

## Projects, site and service

**22. How do we know a project is in trouble?**
Health is calculated automatically: Delayed if past completion, At Risk if behind schedule or 3 or more issues are open. The Assistant explains why: open site issues, backorders, unapproved engineering, a missed date.

**23. Do service tickets have SLAs?**
Yes. Critical 4 hours, High 8, Medium 24, Low 48, and the hours are configurable. Customers raise and follow tickets in the portal.

## Security and data

**24. How secure is it?**
- Role-based access checked on every API call.
- Optional two-step verification (authenticator app).
- Account lockout and rate limits.
- 8-hour sessions validated against the database.
- Encrypted MFA secrets.
- File type checking.
- A full audit log with before and after values and IP address.
- Encrypted backups.

**25. Can we see who changed a discount?**
Yes. The audit log records who, what, when, before, after and IP for every critical action.

**26. Can customers see each other's data?**
No. Portal users are scoped to their own company on the server. They never see costs, other price lists or internal notes.

**27. Can we use Google or Microsoft login?**
Yes, single sign-on is built for existing users. It needs a client ID to be configured.

**28. Where is our data stored?**
In a PostgreSQL database and file storage (local disk or any S3-compatible storage) on infrastructure you choose. The current design is a VM plus Vercel. A backup script makes GPG-encrypted backups of the database and files (schedule it, for example daily), and a restore test script checks them.

**29. Can we migrate our existing product catalogue?**
Yes. There is an importer that copies the in.fixotec.global catalogue (categories, products, variants, datasheets, segments, sectors, news) into the system.

## Integrations

**30. Does it connect to Tally or Zoho Books?**
Invoice export to Tally or Zoho Books is built and is switched on with configuration. Until then, payloads are queued as "not configured".

**31. WhatsApp notifications?**
**Roadmap.** Today there are in-app notifications plus email (when SMTP is set).

**32. Is there an API for other systems?**
Yes. A documented REST API (Swagger at `/api/docs`) with about 200 endpoints.

**33. Is there AI?**
The Operations Assistant answers questions about open RFQs, low stock, project delays, datasheets and demand forecasts. It can use an OpenAI-compatible model, or keyword matching offline. Broader AI is **Roadmap**.

## Website

**34. Can our team update the website without a developer?**
Yes. In ERP **Website** you edit products (photos, text, SEO, publish), datasheets (with approval), categories, news, services, and segments and sectors. Changes go live within 5 minutes.

**35. Will our old Google rankings survive?**
Old WordPress URLs are redirected to the new pages, and every page has SEO titles and descriptions. The sitemap is generated automatically.

**36. Why no prices on the website?**
This is deliberate for B2B: visitors build an RFQ basket by article number, and pricing follows their customer price list.

## Scale and cost

**37. How many users can it handle?**
The stack (NestJS, PostgreSQL, Redis, Next.js) is a standard one that scales by adding API instances. The API keeps sessions in the database, not in memory. Formal load testing hasn't been done yet, so don't promise a specific number of users. Offer a load test as part of rollout.

**38. Can it run in multiple branches or countries?**
The model already supports legal entities, branches (Pune, Delhi, Chennai, Dubai in the demo), plants, warehouses, multiple currencies (INR, USD, EUR, AED) and units.

**39. Is it a one-off build?**
It is built on reusable core infrastructure (auth, RBAC, documents, approvals, audit, notifications) plus industrial modules plus Fixotec configuration. That keeps future modules quicker to deliver.

**40. What do you need from us to go live?**
- Master data: customers with price lists and credit limits, vendors, products and variants with costs, opening stock.
- The approval matrix.
- The list of users and their roles.
- Accounting integration details.
- Content approval for the website.
