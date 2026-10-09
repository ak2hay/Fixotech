# FIXOTEC ONE — End-to-End Industrial ERP & Digital Ecosystem

## 1. Executive Summary

FIXOTEC ONE is a complete industrial ERP and business operating system designed around Fixotec's end-to-end business lifecycle:

Lead → Customer → Project → RFQ → Engineering → BOQ/BOM → Quotation → Sales Order → Procurement/Production → QC → Warehouse → Dispatch → Site Execution → Invoice → Payment → Support → Analytics.

The platform should connect Fixotec's public website, customer/distributor/consultant portals and internal ERP through a single source of truth.

### Core principle

Do not build a generic ERP. Build an engineering-led industrial operating system for a technical MEP support manufacturer.

---

# 2. Product Ecosystem

```text
                         FIXOTEC DIGITAL
                              |
             +----------------+----------------+
             |                                 |
        PUBLIC WEBSITE                    CUSTOMER PORTAL
             |                                 |
        Leads / RFQs                    Orders / Documents
             |                                 |
             +---------------+-----------------+
                             |
                        FIXOTEC ONE
                             |
 +----------+----------+-----+-----+----------+----------+
 |          |          |           |          |          |
 CRM   ENGINEERING   SALES   PROCUREMENT   MFG      PROJECTS
 |          |          |           |          |          |
 Leads      BIM       RFQ          PO         MRP        Sites
 Projects   CAD       Quote        Vendors    BOM        BOQ
 Customers  BOQ       Orders       GRN        Production Issues
                             |
                         INVENTORY
                             |
                         WAREHOUSE
                             |
                          DISPATCH
                             |
                           FINANCE
                             |
                        MANAGEMENT BI
                             |
                       AI ASSISTANT
```

---

# 3. Core Modules

## 3.1 Organization & Administration

- Company
- Legal entities
- Branches
- Offices
- Plants
- Warehouses
- Departments
- Cost centers
- Profit centers
- Financial years
- Tax registrations
- Bank accounts
- Currencies
- Units of measurement
- Business settings

### Organization hierarchy

```text
Fixotec
├── Corporate
├── Sales
│   ├── North
│   ├── West
│   ├── South
│   └── International
├── Engineering
│   ├── Design
│   ├── BIM
│   └── Technical
├── Manufacturing
├── Procurement
├── Warehouse
├── Projects
├── Finance
├── HR
└── Service
```

---

# 4. Identity, Roles & Permissions

## 4.1 Roles

- Super Admin
- Managing Director
- CEO
- Finance Head
- Sales Head
- Sales Manager
- Sales Executive
- Specification Manager
- Engineering Head
- Design Engineer
- BIM Engineer
- Project Manager
- Site Engineer
- Procurement Manager
- Purchase Executive
- Production Manager
- Production Supervisor
- QC Manager
- Warehouse Manager
- Storekeeper
- Dispatch Manager
- HR
- Accounts
- Service Engineer
- Customer
- Dealer
- Distributor
- Contractor
- Consultant

## 4.2 Permission model

Every permission should support:

- View
- Create
- Edit
- Delete
- Approve
- Export
- Download
- Share
- Assign
- Override

Example:

```text
Sales Executive
✓ View customers
✓ Create RFQ
✓ Create quotation
✓ Submit approval
✗ Approve high discounts
✗ Modify product cost
✗ Approve credit limit
```

---

# 5. CRM

## 5.1 Customer Types

- End customer
- Contractor
- MEP contractor
- Consultant
- PMC
- Architect
- Developer
- Distributor
- Dealer
- OEM
- Government
- Export customer

## 5.2 Customer Profile

```text
Customer
├── Company Information
├── Contacts
├── GST / Tax
├── Addresses
├── Credit Limit
├── Payment Terms
├── Price List
├── Projects
├── RFQs
├── Quotations
├── Orders
├── Invoices
├── Payments
├── Complaints
└── Documents
```

---

# 6. Lead Management

## Lifecycle

```text
New Lead
 ↓
Qualified
 ↓
Opportunity
 ↓
Project Identified
 ↓
RFQ
 ↓
Technical Evaluation
 ↓
Quotation
 ↓
Negotiation
 ↓
Won / Lost
```

## Lead Sources

- Website
- LinkedIn
- Exhibition
- Referral
- Distributor
- Consultant
- Google
- Email
- Phone
- WhatsApp
- Existing customer

---

# 7. Project CRM

A customer can have multiple projects.

```text
Customer
├── Project A
│   ├── Consultant
│   ├── Contractor
│   ├── Developer
│   ├── RFQs
│   ├── BOQ
│   ├── Drawings
│   ├── Products
│   └── Orders
└── Project B
```

## Project fields

- Project name
- Project code
- Location
- Client
- Developer
- Consultant
- PMC
- Contractor
- MEP contractor
- Project value
- Estimated Fixotec value
- Start date
- Expected completion
- Project stage
- Probability
- Responsible salesperson

---

# 8. RFQ Management

## RFQ Flow

```text
Customer
 ↓
Project
 ↓
Application
 ↓
Products
 ↓
Quantity
 ↓
Specification
 ↓
Engineering Review
 ↓
Pricing
 ↓
Quotation
```

## RFQ statuses

- Draft
- Received
- Under Review
- Engineering Required
- Pricing
- Approval Pending
- Quoted
- Negotiation
- Won
- Lost
- Cancelled

---

# 9. Product Master

The product master must support engineering-grade attributes instead of only SKU, name and price.

## Product fields

```text
Product
├── Product Family
├── Product Category
├── Product Type
├── SKU
├── Article Number
├── Description
├── Technical Description
├── Application
├── Material
├── Coating
├── Finish
├── Dimensions
├── Weight
├── Load Capacity
├── Thread
├── Pipe Size
├── Pack Size
├── MOQ
├── Manufacturing Method
├── Lead Time
├── HSN
├── GST
├── Purchase Cost
├── Manufacturing Cost
├── Standard Price
├── Customer Price
├── Dealer Price
├── Export Price
├── Images
├── Datasheets
├── CAD
├── BIM
├── Certifications
└── Revision
```

---

# 10. Product Variant Engine

Support attribute-based variants.

Example:

```text
FXR Mounting Rail
├── 41×21
│   ├── 1.5mm
│   ├── 2.0mm
│   └── 2.5mm
├── 41×41
│   ├── 1.5mm
│   ├── 2.0mm
│   └── 2.5mm
└── 41×62
    ├── 2.0mm
    └── 2.5mm
```

Model:

```text
Product
→ Variant
→ Attribute Combination
→ Article Number
```

---

# 11. Engineering Management

## Engineering Request

Fields:

- Project
- RFQ
- Customer
- Application
- Required system
- Load
- Dimensions
- Material
- Installation condition
- Applicable standard
- Engineer
- Due date
- Revision

## Engineering Dashboard

```text
New                  18
Under Review         11
Calculation           7
Drawing               5
Client Approval       9
Approved             14
Rejected              2
```

---

# 12. CAD / BIM Document Management

Engineering files are first-class records.

```text
Project
├── Drawings
├── CAD
├── Revit
├── BIM
├── Calculations
├── Technical Submittals
├── BOQ
├── Datasheets
├── Certificates
├── Approvals
└── Revisions
```

## Versioning

```text
Drawing-001
v1 Draft
v2 Internal Review
v3 Client Review
v4 Approved
```

Approved revisions must never be overwritten.

---

# 13. Technical Submittal Generator

Select:

- Project
- Products
- Datasheets
- Certificates
- Drawings
- Technical specifications

Then generate a consolidated Technical Submittal PDF.

---

# 14. BOQ Management

Support:

- Excel import
- CSV import
- PDF-assisted/manual entry
- ERP-created BOQ

Example:

| Item | Product | Qty | Unit | Rate | Amount |
|---|---|---:|---|---:|---:|
| 1 | FXR Rail | 250 | m | ₹X | ₹X |
| 2 | SRS Clamp | 500 | Nos | ₹X | ₹X |
| 3 | Threaded Rod | 800 | Nos | ₹X | ₹X |

BOQ should flow into:

BOQ → RFQ → Quotation → Order.

---

# 15. Quotation Management

```text
Quotation
├── Customer
├── Project
├── RFQ
├── Validity
├── Payment Terms
├── Delivery Terms
├── Products
├── Quantity
├── Base Price
├── Discount
├── Freight
├── Tax
├── Margin
└── Final Amount
```

## Approval Example

```text
Discount < 10%
→ Sales Manager

10–20%
→ Sales Head

>20%
→ Management
```

The approval engine must be configurable.

---

# 16. Sales Order

```text
Quotation
 ↓
Sales Order
 ↓
Credit Check
 ↓
Stock Check
 ↓
Production / Procurement
 ↓
Dispatch
```

Support:

- Partial orders
- Partial fulfilment
- Backorders
- Customer-specific pricing
- Delivery schedules

---

# 17. Procurement

## Lifecycle

```text
Purchase Requisition
 ↓
Approval
 ↓
RFQ to Vendors
 ↓
Vendor Comparison
 ↓
Purchase Order
 ↓
Material Receipt
 ↓
QC
 ↓
GRN
 ↓
Inventory
 ↓
Vendor Invoice
 ↓
Payment
```

## Vendor Master

- Vendor
- GST
- Contacts
- Bank details
- Material categories
- Price history
- Lead time
- Quality rating
- Delivery performance
- Payment terms
- Compliance documents

---

# 18. Inventory

## Warehouse Structure

```text
Warehouse
├── Raw Material
├── WIP
├── Finished Goods
├── Rejected
├── QC Hold
└── Scrap
```

## Stock transaction ledger

Every movement creates a transaction:

- Opening
- Purchase
- Production Receipt
- Sales
- Transfer
- Adjustment
- Scrap
- Return
- Consumption

Do not directly edit stock quantity.

---

# 19. Batch / Lot / Traceability

Support:

- Batch number
- Lot number
- Heat number
- Manufacturing date
- Coating batch
- QC status
- Supplier batch
- Traceability

---

# 20. Manufacturing

## Production Flow

```text
Sales Order
 ↓
Production Requirement
 ↓
MRP
 ↓
Material Availability
 ↓
Production Order
 ↓
Job Card
 ↓
Machine Allocation
 ↓
Raw Material Issue
 ↓
Production
 ↓
QC
 ↓
Finished Goods
 ↓
Warehouse
```

---

# 21. BOM

Example:

```text
Finished Product
├── Steel
├── Rubber
├── Bolt
├── Nut
├── Washer
└── Coating
```

Support:

- Single-level BOM
- Multi-level BOM
- Alternate materials
- Scrap %
- Yield
- Labour
- Machine time
- Overhead

---

# 22. MRP

Formula:

```text
Demand
- Current Stock
- Open Purchase Orders
- Open Production
+ Safety Stock
= Net Requirement
```

Generate:

- Purchase requisitions
- Production orders
- Stock transfer requests

---

# 23. Production Planning

Planning board:

```text
Machine       Mon    Tue    Wed    Thu    Fri

Laser-01      ████   ████
Press-01             █████  ███
CNC-02        ██            █████
```

Track:

- Capacity
- Utilization
- Downtime
- Planned production
- Actual production
- Pending orders

---

# 24. Shop Floor

Tablet-friendly operator interface.

```text
JOB #PRD-1048

Product:
FXR 41×41

Required:
500 Nos

Material:
Available

Machine:
Laser-02

[ Start ]
[ Pause ]
[ Complete ]
[ Report Issue ]
```

---

# 25. Quality Control

## Incoming QC

Supplier Material → QC → Accept / Reject

## In-process QC

Production → Inspection → Continue / Rework

## Final QC

Finished Product → Inspection → Release

## Parameters

Configurable by product:

- Dimensions
- Thickness
- Load capacity
- Material
- Coating
- Visual inspection
- Thread quality
- Welding quality
- Surface finish

---

# 26. Non-Conformance Management

```text
NCR
├── Issue
├── Product
├── Batch
├── Supplier
├── Root Cause
├── Corrective Action
├── Preventive Action
├── Owner
├── Deadline
└── Closure
```

---

# 27. Warehouse Management

Dashboard:

```text
Total SKUs        1,248
Low Stock            72
QC Hold              14
Pending Dispatch     18
Today's Receipts      9
```

Features:

- Bin locations
- Barcode
- QR code
- Putaway
- Picking
- Packing
- Transfer
- Cycle counting
- Stock adjustment
- Stock ageing

---

# 28. Dispatch

```text
Sales Order
 ↓
Pick List
 ↓
Picking
 ↓
Packing
 ↓
Dispatch Note
 ↓
Transport
 ↓
Tracking
 ↓
Customer Delivery
```

Support:

- Partial dispatch
- Multiple warehouses
- Transporter
- LR number
- E-way bill reference
- Delivery proof

---

# 29. Project Management

Every major project gets a workspace.

```text
PROJECT: ABC DATA CENTER

Overview
RFQs
BOQ
Engineering
Drawings
Products
Orders
Procurement
Manufacturing
Dispatch
Site
Issues
Documents
Billing
Payments
Reports
```

---

# 30. Site Management

Mobile-first interface.

Site engineer can:

- Check in
- View project
- View drawings
- View BOQ
- Record installation
- Upload photos
- Create site issue
- Create inspection report
- Record material consumption
- Report shortage
- Record labour
- Capture client signature

---

# 31. Site Issue Management

```text
Issue
 ↓
Assigned
 ↓
Under Investigation
 ↓
Action Required
 ↓
Resolved
 ↓
Verified
 ↓
Closed
```

---

# 32. Service & Complaint Management

```text
Ticket
 ↓
Priority
 ↓
Assigned Engineer
 ↓
Investigation
 ↓
Resolution
 ↓
Customer Confirmation
 ↓
Closed
```

Configurable SLA:

```text
Critical → 4 hours
High     → 8 hours
Medium   → 24 hours
Low      → 48 hours
```

---

# 33. Finance

Initially integrate with an established accounting platform instead of recreating a full accounting engine.

ERP responsibilities:

- Customer receivables
- Vendor payables
- Credit limits
- Payment terms
- Invoice status
- Collections
- Expenses
- Cost centers
- Project profitability
- Tax data
- GST data
- Accounting integration

Flow:

```text
Quotation
 ↓
Sales Order
 ↓
Delivery
 ↓
Invoice
 ↓
Receivable
 ↓
Payment
```

---

# 34. HR

## Employee Master

- Employee
- Department
- Role
- Branch
- Manager
- Joining date
- Documents
- Salary information

## HR

- Attendance
- Leave
- Payroll integration
- Expense claims
- Travel
- Assets
- Performance
- Training
- Exit

Payroll should be integration-ready in V1 rather than rebuilt unnecessarily.

---

# 35. Expense Management

Categories:

- Travel
- Fuel
- Hotel
- Food
- Client Meeting
- Site Expense
- Purchase
- Other

Approval:

```text
Employee
 ↓
Manager
 ↓
Finance
 ↓
Paid
```

---

# 36. Document Management

Central repository:

```text
Customer
Project
Product
Vendor
Employee
Quotation
PO
Invoice
Drawing
BIM
Certificate
QC
Contract
```

Features:

- Versioning
- Access control
- Expiry dates
- Approval
- Digital signatures
- Audit history

---

# 37. Notification Engine

Channels:

- In-app
- Email
- WhatsApp
- SMS
- Push

Examples:

- RFQ assigned
- Quotation approval required
- PO approved
- Stock below reorder level
- Project milestone delayed
- Customer payment overdue

---

# 38. Approval Engine

Do not hard-code approval rules.

Create configurable workflows.

Example:

```text
IF quotation.discount > 15%
THEN Sales Head approval

IF purchase.value > ₹5L
THEN Procurement Head approval

IF purchase.value > ₹20L
THEN Management approval

IF engineering.status = "client_submission"
THEN Engineering Head approval
```

---

# 39. Workflow Engine

Every important object should support:

- Draft
- Submitted
- Under Review
- Approved
- Rejected
- Cancelled
- Completed

Each workflow record should have:

- Owner
- Approver
- SLA
- Comments
- Timestamp
- Audit trail

---

# 40. Management Dashboard

The CEO/MD should see business health rather than individual transactions.

```text
FIXOTEC EXECUTIVE DASHBOARD

Revenue             ₹XX Cr
Orders              ₹XX Cr
Pipeline            ₹XX Cr
Gross Margin         XX%
Receivables          ₹XX Cr
Inventory            ₹XX Cr

SALES
Won                 XX
RFQs                XX
Conversion           XX%

MANUFACTURING
Production           XX%
Capacity             XX%
Rejection             X%

PROJECTS
Active               XX
Delayed               X

PROCUREMENT
Open PO              ₹XX
Critical shortages    XX

COLLECTIONS
Due                  ₹XX
Overdue              ₹XX
```

---

# 41. Analytics

## Sales

- Revenue
- Pipeline
- Conversion
- Average deal size
- Salesperson performance
- Region
- Product
- Customer
- Industry

## Manufacturing

- Production
- Efficiency
- OEE
- Scrap
- Downtime
- Cost

## Inventory

- Stock value
- Slow moving
- Fast moving
- Dead stock
- Inventory ageing
- Stock turnover

## Projects

- Project margin
- Project progress
- Material consumption
- Delay
- Billing
- Outstanding

---

# 42. Customer Portal

```text
CUSTOMER PORTAL

Dashboard
Projects
RFQs
Quotations
Orders
Deliveries
Invoices
Documents
Technical Downloads
Support Tickets
Profile
```

Customer actions:

- Submit RFQ
- Download quotation
- Approve quotation
- Track order
- Download invoice
- Raise support ticket

---

# 43. Distributor Portal

```text
Distributor Portal

Product Catalogue
Price List
Stock Availability
Orders
Order History
Invoices
Targets
Schemes
Claims
Marketing Material
```

---

# 44. Consultant Portal

```text
Consultant Portal

Products
Technical Datasheets
CAD
BIM
Specifications
Certificates
Approved Products
Projects
Technical Requests
Submittals
```

---

# 45. Public Website

The public website should be a premium technical B2B website rather than a basic corporate catalogue.

## Sitemap

```text
HOME

SOLUTIONS
├── HVAC
├── Plumbing
├── Electrical
├── Fire Fighting
├── Data Centers
├── High-Rise
├── Hospitals
├── Hotels
├── Industrial
└── Custom Solutions

PRODUCTS
├── Mounting Channels
├── Mounting Rails
├── Pipe Clamps
├── Hangers
├── Connectors
├── Threaded Rods
├── Anchors
├── Seismic Systems
├── Ground Mounting
└── Accessories

ENGINEERING
├── Engineering Services
├── BIM
├── CAD
├── Technical Calculations
├── Technical Submittals
└── Downloads

PROJECTS

RESOURCES
├── Product Catalogue
├── Datasheets
├── BIM Library
├── CAD Library
├── Certifications
├── Case Studies
└── Knowledge Centre

ABOUT
├── Company
├── Manufacturing
├── Quality
├── Certifications
└── Global Presence

CONTACT

REQUEST QUOTE
```

---

# 46. Website Visual Direction

## Design language

- Premium industrial
- German engineering influence
- Technical precision
- Architectural imagery
- Dark/neutral industrial surfaces
- Strong typography
- High-quality product renders
- Technical diagrams
- Clean grids
- Minimal decorative elements
- Strong CTAs

Avoid:

- Generic corporate stock-template look
- Overloaded gradients
- Excessive animations
- Huge paragraphs
- Generic "Welcome to Fixotec" messaging

---

# 47. Homepage Structure

## Hero

```text
ENGINEERED FOR
WHAT'S ABOVE.

Precision-engineered modular support
systems for modern MEP infrastructure.

[ EXPLORE SOLUTIONS ]   [ REQUEST A QUOTE ]
```

Hero visual:

- Industrial MEP support system
- Architectural ceiling/services environment
- Detailed steel components
- Engineering drawings/data overlays used sparingly

## Section 2 — Engineering Trust

```text
German Engineering
Technical Expertise
Modular Systems
Quality Controlled
BIM Ready
```

## Section 3 — Solutions

Cards:

- HVAC
- Plumbing
- Electrical
- Fire Protection
- Data Centers
- Industrial

## Section 4 — Product Ecosystem

```text
Rails
+
Clamps
+
Connectors
+
Hangers
+
Accessories
=
Complete Support System
```

## Section 5 — Engineering

Headline:

"From specification to installation."

CTA:

"TALK TO AN ENGINEER"

## Section 6 — Industries

- Data Centers
- High-Rise
- Hospitals
- Hotels
- Manufacturing
- Power

## Section 7 — Projects

Large case-study cards.

## Section 8 — Technical Library

```text
CAD
BIM
DATASHEETS
CERTIFICATIONS
CATALOGUES
```

## Section 9 — RFQ

```text
Tell us what you're building.
We'll help you support it.

Name
Company
Email
Phone
Project
Application
Upload BOQ
Upload Drawing

[ REQUEST TECHNICAL ASSISTANCE ]
```

---

# 48. Product Page

Example:

```text
FXR 41 | 41
Universal Mounting Rail

PRODUCT OVERVIEW

Technical Specifications

Material       DX51D / DD11
Finish         Galvanized / HDG
Length         2m / 3m / 6m
Thickness      1.5 / 2.0 / 2.5mm

APPLICATIONS

HVAC
Plumbing
Fire Fighting
Cable Trays

ENGINEERING DATA

Load capacity
Dimensions
Installation
Compatible components

DOWNLOADS

[ DATASHEET ]
[ CAD ]
[ BIM ]
[ INSTALLATION GUIDE ]

Need help selecting a product?

[ TALK TO ENGINEERING ]
[ REQUEST QUOTE ]
```

---

# 49. Product Configurator

```text
FIND YOUR SOLUTION

What are you installing?

○ Pipe
○ Cable Tray
○ Duct
○ Equipment
○ AHU
○ ODU

Pipe Size
[ 100 mm ]

Application
[ HVAC ]

Installation
[ Ceiling ]

Environment
[ Indoor ]

[ FIND SOLUTION ]
```

Result:

```text
RECOMMENDED SYSTEM

FXR 41×41
SRS Heavy
Threaded Rod
FXR Connector

[ VIEW SYSTEM ]
[ ADD TO RFQ ]
```

---

# 50. Website Search

Search must support natural technical queries:

- 100mm pipe clamp
- 41x41 rail
- fire fighting support
- data center support
- seismic support
- HDG rail
- heavy duty hanger

Search should return products, documents, solutions and related technical files.

---

# 51. Website → ERP Integration

```text
FIXOTEC WEBSITE
       |
       +---- Product Search
       +---- RFQ Form
       +---- Contact Form
       +---- Project Enquiry
       |
       v
FIXOTEC ERP
       |
 +-----+------+---------+
 |            |         |
CRM      ENGINEERING   SALES
```

Website RFQs automatically create leads/projects/RFQs in the ERP.

---

# 52. Website Admin

Authorized employees can manage:

- Products
- Product variants
- Images
- Technical specifications
- Datasheets
- CAD
- BIM
- Certifications
- Projects
- Case studies
- Blog
- Industries
- Solutions
- SEO
- Homepage sections
- Leads

No developer should be required for normal content changes.

---

# 53. SEO Architecture

Recommended URL structure:

```text
/solutions/hvac-support-systems
/solutions/fire-fighting-support-systems
/solutions/data-center-support-systems
/solutions/pipe-support-systems

/products/fxr-mounting-rail
/products/srs-heavy
/products/riser-clamp

/industries/data-centers
/industries/hospitals
/industries/high-rise

/resources/bim
/resources/cad
/resources/datasheets
```

Each page should have:

- Unique title
- Meta description
- Structured data
- Canonical URL
- Internal linking
- Related products
- Related solutions
- RFQ CTA

---

# 54. Mobile Applications

## Sales App

- Leads
- Customers
- Projects
- RFQs
- Quotes
- Follow-ups

## Site App

- Projects
- Drawings
- BOQ
- Site Reports
- Photos
- Issues
- Materials

## Warehouse App

- Receive
- Pick
- Transfer
- Dispatch
- Scan Barcode
- Stock Count

## Production App

- Jobs
- Machine
- Production
- Downtime
- QC
- Completion

---

# 55. AI Layer

Future AI features:

## AI Sales Assistant

Ask:

> Show pending RFQs for data center projects above ₹25 lakh.

## AI Product Search

Ask:

> Which product supports this pipe size?

## AI Document Search

Ask:

> Find the datasheet for FXR 41×41 2mm HDG.

## AI Reporting

Ask:

> Why is Project X delayed?

## AI Operations

Ask:

> Which products are below safety stock?

## AI Forecasting

- Demand forecast
- Inventory forecast
- Sales forecast
- Procurement forecast

---

# 56. Security

Required:

- MFA
- RBAC
- API authentication
- Encryption at rest
- TLS
- Audit logs
- IP restrictions for sensitive areas
- Session management
- Password policies
- Backup
- Disaster recovery
- File access control
- Data retention
- Approval history

Every critical action should record:

```text
Who
What
When
Before
After
IP
```

Example:

```text
Akshay changed quotation discount:
12% → 18%
```

---

# 57. Infrastructure Architecture

Recommended initial architecture:

```text
                    INTERNET
                       |
                Cloudflare / CDN
                       |
                 Load Balancer
                       |
              +--------+--------+
              | API Application |
              |    Backend      |
              +--------+--------+
                       |
          +------------+-------------+
          |            |             |
      PostgreSQL     Redis       Object Storage
       Core DB      Cache/Queue   CAD/BIM/Files
```

## Recommended stack

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend

- NestJS
- TypeScript

### Database

- PostgreSQL

### Cache

- Redis

### Jobs

- BullMQ

### Object Storage

- S3-compatible storage

### Search

- OpenSearch/Elasticsearch later

### Authentication

- OAuth/OIDC
- JWT
- MFA
- RBAC

### Deployment

```text
Cloudflare
 ↓
Vercel / CDN
 ↓
Application API
 ↓
AWS/GCP
 ↓
PostgreSQL
Redis
S3
```

---

# 58. Database Architecture

Core entities:

```text
organizations
branches
departments
users
roles
permissions

customers
contacts
vendors
employees

products
product_categories
product_variants
product_attributes
product_documents
product_revisions

leads
opportunities
projects
project_members

rfqs
rfq_items
quotations
quotation_items
sales_orders
sales_order_items

bom
bom_items
production_orders
production_operations
machines
work_centers

purchase_requests
purchase_orders
purchase_order_items
goods_receipts

warehouses
warehouse_bins
inventory
inventory_transactions

quality_inspections
ncrs

dispatches
delivery_notes

site_visits
site_reports
site_issues

invoices
payments
expenses

documents
approvals
notifications
audit_logs
```

---

# 59. Internal Event Architecture

Use domain events internally.

Example:

```text
SalesOrderCreated
       ↓
InventoryCheckRequested
       ↓
ProductionRequirementCreated
       ↓
MaterialRequirementCreated
       ↓
PurchaseRequestCreated
```

Another:

```text
GoodsReceived
      ↓
QCRequired
      ↓
QCApproved
      ↓
InventoryUpdated
      ↓
PurchaseOrderUpdated
```

---

# 60. API Architecture

```text
/api/v1/auth
/api/v1/users
/api/v1/customers
/api/v1/vendors

/api/v1/products
/api/v1/product-variants
/api/v1/documents

/api/v1/leads
/api/v1/opportunities
/api/v1/projects

/api/v1/rfqs
/api/v1/quotations
/api/v1/sales-orders

/api/v1/purchases
/api/v1/vendors

/api/v1/inventory
/api/v1/warehouses

/api/v1/bom
/api/v1/production
/api/v1/work-orders

/api/v1/quality
/api/v1/ncr

/api/v1/dispatch
/api/v1/sites

/api/v1/invoices
/api/v1/payments

/api/v1/reports
/api/v1/notifications
```

---

# 61. Integrations

Plan for:

### Accounting

- Tally
- Zoho Books
- SAP integration later

### Communication

- WhatsApp Business
- Email
- SMS

### Payments

- Payment gateway where applicable

### Logistics

- Transporter/logistics APIs

### Engineering

- Autodesk/Revit ecosystem
- CAD/BIM storage

### Identity

- Google SSO
- Microsoft SSO

---

# 62. Recommended Development Phases

Do not build every module simultaneously.

## Phase 1 — Foundation

```text
Auth
Users
Roles
Organization
Customers
Vendors
Products
Documents
Audit
Notifications
```

## Phase 2 — Sales

```text
CRM
Leads
Projects
RFQ
Quotation
Sales Orders
Customer Portal
```

## Phase 3 — Engineering

```text
Engineering Requests
BOM
BOQ
Drawings
CAD
BIM
Technical Submittals
Approvals
```

## Phase 4 — Procurement + Inventory

```text
Purchase
Vendors
GRN
Warehouse
Bins
Inventory
Stock Transfers
Dispatch
```

## Phase 5 — Manufacturing

```text
BOM
MRP
Production
Machines
Work Centers
Job Cards
QC
NCR
Production Planning
```

## Phase 6 — Projects

```text
Site
Installation
Site Reports
Issues
Progress
Material Consumption
Handover
```

## Phase 7 — Finance

```text
Invoices
Receivables
Payables
Payments
Expenses
Project Profitability
Accounting Integration
```

## Phase 8 — Intelligence

```text
BI
AI Search
AI Assistant
Forecasting
Demand Planning
Management Cockpit
```

---

# 63. MVP Recommendation

The first production release should NOT attempt the complete ERP.

Build this first:

```text
AUTH
+
CUSTOMERS
+
PRODUCT MASTER
+
CRM
+
PROJECTS
+
RFQ
+
QUOTATION
+
SALES ORDER
+
ENGINEERING
+
BOQ
+
DOCUMENTS
+
INVENTORY
+
PURCHASE
+
CUSTOMER PORTAL
+
PUBLIC WEBSITE
```

Then add manufacturing and deep project execution.

This gives Fixotec a usable business system while the manufacturing modules are being developed.

---

# 64. Long-Term Vision

The final Fixotec digital ecosystem should become:

```text
                    FIXOTEC ONE
                         |
     +-------------------+-------------------+
     |                   |                   |
  WEBSITE             PORTALS              ERP
     |                   |                   |
 Marketing         Customers             CRM
 Products          Distributors          Sales
 RFQ               Consultants           Engineering
 SEO                                     Procurement
                                         Inventory
                                         Manufacturing
                                         Quality
                                         Projects
                                         Warehouse
                                         Dispatch
                                         Finance
                                         HR
                                         Service
                                             |
                                             v
                                      MANAGEMENT BI
                                             |
                                             v
                                        AI LAYER
```

---

# 65. Rkyves Product Strategy

Do not build the Fixotec implementation as a one-off codebase.

Create reusable Rkyves infrastructure:

```text
Rkyves Core
├── Authentication
├── RBAC
├── Organizations
├── Users
├── Documents
├── Notifications
├── Workflow Engine
├── Approval Engine
├── Audit Logs
├── Reporting
├── API Framework
└── AI Layer
```

Then Fixotec becomes:

```text
Rkyves Core
+
Industrial Modules
+
Fixotec Configuration
```

This creates the foundation for a future:

# Rkyves Industrial OS

that can be sold to other:

- Manufacturers
- Engineering companies
- MEP companies
- Fabricators
- Industrial distributors
- Machine-part manufacturers
- B2B suppliers

---

# 66. Recommended Commercial Positioning

Do not pitch this as:

> "We can make you an ERP."

Pitch:

> # FIXOTEC ONE
> ### One digital operating system connecting engineering, sales, manufacturing and project execution.

The first commercial pilot should focus on:

**RFQ → Engineering → BOQ → Quotation → Order**

Then progressively connect:

**Procurement → Inventory → Manufacturing → Dispatch → Projects → Finance.**

This creates a practical entry point while keeping the long-term architecture enterprise-grade.

---

# 67. Final Product Vision

The completed system should allow Fixotec to operate the majority of its business from one connected platform:

```text
LEAD
 ↓
CUSTOMER
 ↓
PROJECT
 ↓
RFQ
 ↓
ENGINEERING
 ↓
BOQ / BOM
 ↓
QUOTATION
 ↓
APPROVAL
 ↓
SALES ORDER
 ↓
MRP
 ↓
PROCUREMENT / PRODUCTION
 ↓
QC
 ↓
WAREHOUSE
 ↓
DISPATCH
 ↓
SITE INSTALLATION
 ↓
INVOICE
 ↓
PAYMENT
 ↓
SUPPORT
 ↓
PROJECT CLOSURE
 ↓
ANALYTICS
```

The website, customer portal, consultant portal, distributor portal and mobile apps all connect to the same platform.

This is the target architecture for **FIXOTEC ONE — a complete industrial business operating system powered and implemented by Rkyves.**
