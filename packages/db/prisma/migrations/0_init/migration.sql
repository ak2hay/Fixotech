-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "customerId" TEXT,
    "branchId" TEXT,
    "departmentId" TEXT,
    "jobTitle" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'STAFF',

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalEntity" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plant" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfitCenter" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProfitCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialYear" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FinancialYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRegistration" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT NOT NULL,

    CONSTRAINT "TaxRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNo" TEXT NOT NULL,
    "ifsc" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Currency" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "rateToInr" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "BusinessSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "BusinessSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "NumberSequence" (
    "key" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,
    "pad" INTEGER NOT NULL DEFAULT 4,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "emailStatus" TEXT,
    "readAt" TIMESTAMP(3),
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowEvent" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "approverRole" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ruleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requesterId" TEXT,
    "approverRole" TEXT NOT NULL,
    "snapshot" JSONB,
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "audiences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentShare" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "gstin" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "creditLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentTerms" TEXT,
    "priceList" TEXT NOT NULL DEFAULT 'STANDARD',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "gstin" TEXT,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "contactName" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "application" TEXT,
    "message" TEXT,
    "estimatedValue" DECIMAL(14,2),
    "customerId" TEXT,
    "projectId" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "customerId" TEXT NOT NULL,
    "developerId" TEXT,
    "consultantId" TEXT,
    "pmcId" TEXT,
    "contractorId" TEXT,
    "mepContractorId" TEXT,
    "projectValue" DECIMAL(14,2),
    "fixotecValue" DECIMAL(14,2),
    "startDate" TIMESTAMP(3),
    "expectedCompletion" TIMESTAMP(3),
    "stage" TEXT NOT NULL DEFAULT 'IDENTIFIED',
    "probability" INTEGER NOT NULL DEFAULT 20,
    "ownerId" TEXT,
    "notes" TEXT,
    "coverImageKey" TEXT,
    "health" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "ProjectMilestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "plannedDate" TIMESTAMP(3),
    "actualDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFamily" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "ProductFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imageKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "familyId" TEXT,
    "categoryId" TEXT,
    "productType" TEXT NOT NULL DEFAULT 'FINISHED',
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "technicalDescription" TEXT,
    "applications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "material" TEXT,
    "coating" TEXT,
    "finish" TEXT,
    "hsn" TEXT,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "manufacturingMethod" TEXT,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 14,
    "moq" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "packSize" TEXT,
    "supplyMode" TEXT NOT NULL DEFAULT 'MAKE',
    "purchaseCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "manufacturingCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "standardPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "weightKg" DECIMAL(14,3),
    "loadCapacity" TEXT,
    "thread" TEXT,
    "pipeSize" TEXT,
    "lengthLabel" TEXT,
    "revision" TEXT NOT NULL DEFAULT 'A',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "imageKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "heroImageKey" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "segments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sectors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "articleNumber" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "barcode" TEXT,
    "purchaseCost" DECIMAL(14,2) NOT NULL,
    "manufacturingCost" DECIMAL(14,2) NOT NULL,
    "standardPrice" DECIMAL(14,2) NOT NULL,
    "customerPrice" DECIMAL(14,2),
    "dealerPrice" DECIMAL(14,2),
    "exportPrice" DECIMAL(14,2),
    "safetyStock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT,
    "projectId" TEXT,
    "leadId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "application" TEXT,
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqItem" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "variantId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'NOS',
    "specification" TEXT,

    CONSTRAINT "RfqItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "projectId" TEXT,
    "rfqId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3),
    "paymentTerms" TEXT,
    "deliveryTerms" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "marginPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "customerAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "variantId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'NOS',
    "basePrice" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 18,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "projectId" TEXT,
    "quotationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditExposure" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "variantId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "fulfilledQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "backorderedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "schedule" JSONB,

    CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Boq" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "projectId" TEXT,
    "rfqId" TEXT,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Boq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoqItem" (
    "id" TEXT NOT NULL,
    "boqId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "variantId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'NOS',
    "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "BoqItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineeringRequest" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "projectId" TEXT,
    "rfqId" TEXT,
    "customerId" TEXT,
    "application" TEXT,
    "requiredSystem" TEXT,
    "load" TEXT,
    "dimensions" TEXT,
    "material" TEXT,
    "installationCondition" TEXT,
    "standard" TEXT,
    "engineerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "revision" TEXT NOT NULL DEFAULT 'A',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineeringRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submittal" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "selections" JSONB NOT NULL,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submittal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "paymentTerms" TEXT,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 14,
    "qualityRating" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "deliveryScore" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "ifsc" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorContact" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,

    CONSTRAINT "VendorContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequisition" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "requesterId" TEXT,
    "neededBy" TIMESTAMP(3),
    "notes" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequisitionItem" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "variantId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "PurchaseRequisitionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorQuote" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "amount" DECIMAL(14,2) NOT NULL,
    "leadTimeDays" INTEGER,
    "notes" TEXT,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "requisitionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expectedOn" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "variantId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "receivedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "rate" DECIMAL(14,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 18,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptItem" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT,
    "variantId" TEXT,
    "qty" DECIMAL(14,3) NOT NULL,
    "batchCode" TEXT,

    CONSTRAINT "GoodsReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "plantId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseBin" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "barcode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WarehouseBin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchLot" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "heatNumber" TEXT,
    "coatingBatch" TEXT,
    "supplierBatch" TEXT,
    "manufacturedOn" TIMESTAMP(3),
    "qcStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "vendorId" TEXT,

    CONSTRAINT "BatchLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "binId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "batchKey" TEXT NOT NULL DEFAULT '_',
    "batchId" TEXT,
    "qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "avgCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "binId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL DEFAULT '',
    "qty" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bom" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "revision" TEXT NOT NULL DEFAULT 'A',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "yieldPct" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "labourMinutes" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "machineMinutes" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "overheadCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomItem" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "componentVariantId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "scrapPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'NOS',
    "alternateGroup" TEXT,
    "isAlternate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BomItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkCenter" (
    "id" TEXT NOT NULL,
    "plantId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "WorkCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "workCenterId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacityPerDay" DECIMAL(8,2) NOT NULL DEFAULT 8,
    "status" TEXT NOT NULL DEFAULT 'IDLE',

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "completedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "salesOrderId" TEXT,
    "warehouseId" TEXT,
    "machineId" TEXT,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCard" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "machineId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "requiredQty" DECIMAL(14,3) NOT NULL,
    "completedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "issueNote" TEXT,
    "downtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityInspection" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "variantId" TEXT,
    "batchId" TEXT,
    "goodsReceiptId" TEXT,
    "productionOrderId" TEXT,
    "parameters" JSONB NOT NULL,
    "notes" TEXT,
    "inspectedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ncr" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "inspectionId" TEXT,
    "variantId" TEXT,
    "batchId" TEXT,
    "vendorId" TEXT,
    "issue" TEXT NOT NULL,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "preventiveAction" TEXT,
    "ownerId" TEXT,
    "deadline" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ncr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PICK_LIST',
    "transporter" TEXT,
    "lrNumber" TEXT,
    "ewayBill" TEXT,
    "vehicleNo" TEXT,
    "proofNote" TEXT,
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatchNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchItem" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "salesOrderItemId" TEXT,
    "variantId" TEXT,
    "qty" DECIMAL(14,3) NOT NULL,
    "pickedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "DispatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteVisit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOutAt" TIMESTAMP(3),
    "latitude" DECIMAL(10,6),
    "longitude" DECIMAL(10,6),
    "notes" TEXT,

    CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "visitId" TEXT,
    "installationNotes" TEXT,
    "labourHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "clientSignatureName" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteIssue" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "shortage" BOOLEAN NOT NULL DEFAULT false,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialConsumption" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reportId" TEXT,
    "variantId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTicket" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT,
    "projectId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "slaHours" INTEGER NOT NULL DEFAULT 24,
    "dueAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketComment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "salesOrderId" TEXT,
    "dispatchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "salesOrderItemId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorBill" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "goodsReceiptId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "total" DECIMAL(14,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "customerId" TEXT,
    "vendorId" TEXT,
    "invoiceId" TEXT,
    "purchaseOrderId" TEXT,
    "vendorBillId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'NEFT',
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "employeeId" TEXT,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "spentOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingExport" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "externalId" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT,
    "branchId" TEXT,
    "managerId" TEXT,
    "joiningDate" TIMESTAMP(3),
    "salary" DECIMAL(14,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "assignedEmployeeId" TEXT,

    CONSTRAINT "AssetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributorTarget" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metric" TEXT NOT NULL DEFAULT 'REVENUE',
    "targetAmount" DECIMAL(14,2) NOT NULL,
    "achievedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "DistributorTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Scheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchemeClaim" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchemeClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Solution" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "applications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageKey" TEXT,
    "heroImageKey" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Solution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Industry" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'BUILDINGS',
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageKey" TEXT,
    "heroImageKey" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Industry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "imageKey" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUrl" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceArea" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "iconKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStudy" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "sector" TEXT,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "year" INTEGER,
    "published" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CaseStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsBlock" (
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "body" TEXT,
    "data" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsBlock_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ConfiguratorRule" (
    "id" TEXT NOT NULL,
    "installing" TEXT NOT NULL,
    "application" TEXT,
    "installation" TEXT,
    "environment" TEXT,
    "minSizeMm" INTEGER,
    "maxSizeMm" INTEGER,
    "label" TEXT NOT NULL,
    "articles" TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ConfiguratorRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_resource_action_key" ON "Permission"("resource", "action");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LegalEntity_code_key" ON "LegalEntity"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Plant_code_key" ON "Plant"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_code_key" ON "CostCenter"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProfitCenter_code_key" ON "ProfitCenter"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialYear_label_key" ON "FinancialYear"("label");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "DomainEvent_name_createdAt_idx" ON "DomainEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "WorkflowEvent_entityType_entityId_idx" ON "WorkflowEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Comment_entityType_entityId_idx" ON "Comment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_entityType_entityId_idx" ON "ApprovalRequest"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_idx" ON "ApprovalRequest"("status");

-- CreateIndex
CREATE INDEX "Document_entityType_entityId_idx" ON "Document"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Document_category_idx" ON "Document"("category");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentShare_token_key" ON "DocumentShare"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_number_key" ON "Lead"("number");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_stage_idx" ON "Project"("stage");

-- CreateIndex
CREATE INDEX "ProjectMilestone_projectId_sortOrder_idx" ON "ProjectMilestone"("projectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMilestone_projectId_key_key" ON "ProjectMilestone"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFamily_name_key" ON "ProductFamily"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFamily_slug_key" ON "ProductFamily"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_slug_key" ON "ProductCategory"("slug");

-- CreateIndex
CREATE INDEX "ProductCategory_parentId_idx" ON "ProductCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_articleNumber_key" ON "ProductVariant"("articleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_barcode_key" ON "ProductVariant"("barcode");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_number_key" ON "Rfq"("number");

-- CreateIndex
CREATE INDEX "Rfq_status_idx" ON "Rfq"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_number_key" ON "Quotation"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_number_key" ON "SalesOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Boq_number_key" ON "Boq"("number");

-- CreateIndex
CREATE UNIQUE INDEX "EngineeringRequest_number_key" ON "EngineeringRequest"("number");

-- CreateIndex
CREATE INDEX "EngineeringRequest_status_idx" ON "EngineeringRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Submittal_number_key" ON "Submittal"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_code_key" ON "Vendor"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequisition_number_key" ON "PurchaseRequisition"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_number_key" ON "GoodsReceipt"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseBin_barcode_key" ON "WarehouseBin"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseBin_warehouseId_code_key" ON "WarehouseBin"("warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BatchLot_code_key" ON "BatchLot"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_warehouseId_binId_variantId_batchKey_key" ON "InventoryBalance"("warehouseId", "binId", "variantId", "batchKey");

-- CreateIndex
CREATE INDEX "InventoryTransaction_variantId_createdAt_idx" ON "InventoryTransaction"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_referenceType_referenceId_idx" ON "InventoryTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkCenter_code_key" ON "WorkCenter"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_code_key" ON "Machine"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_number_key" ON "ProductionOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "JobCard_number_key" ON "JobCard"("number");

-- CreateIndex
CREATE UNIQUE INDEX "QualityInspection_number_key" ON "QualityInspection"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Ncr_number_key" ON "Ncr"("number");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchNote_number_key" ON "DispatchNote"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SiteIssue_number_key" ON "SiteIssue"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTicket_number_key" ON "ServiceTicket"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "VendorBill_number_key" ON "VendorBill"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_number_key" ON "Payment"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_number_key" ON "Expense"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_code_key" ON "Employee"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_employeeId_day_key" ON "Attendance"("employeeId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "AssetItem_code_key" ON "AssetItem"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Solution_slug_key" ON "Solution"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Industry_slug_key" ON "Industry"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");

-- CreateIndex
CREATE INDEX "Post_publishedAt_idx" ON "Post"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceArea_slug_key" ON "ServiceArea"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CaseStudy_slug_key" ON "CaseStudy"("slug");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Office" ADD CONSTRAINT "Office_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plant" ADD CONSTRAINT "Plant_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRegistration" ADD CONSTRAINT "TaxRegistration_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_pmcId_fkey" FOREIGN KEY ("pmcId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_mepContractorId_fkey" FOREIGN KEY ("mepContractorId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ProductFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqItem" ADD CONSTRAINT "RfqItem_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqItem" ADD CONSTRAINT "RfqItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boq" ADD CONSTRAINT "Boq_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boq" ADD CONSTRAINT "Boq_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqItem" ADD CONSTRAINT "BoqItem_boqId_fkey" FOREIGN KEY ("boqId") REFERENCES "Boq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqItem" ADD CONSTRAINT "BoqItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringRequest" ADD CONSTRAINT "EngineeringRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringRequest" ADD CONSTRAINT "EngineeringRequest_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringRequest" ADD CONSTRAINT "EngineeringRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringRequest" ADD CONSTRAINT "EngineeringRequest_engineerId_fkey" FOREIGN KEY ("engineerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submittal" ADD CONSTRAINT "Submittal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorContact" ADD CONSTRAINT "VendorContact_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisitionItem" ADD CONSTRAINT "PurchaseRequisitionItem_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PurchaseRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PurchaseRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PurchaseRequisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseBin" ADD CONSTRAINT "WarehouseBin_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchLot" ADD CONSTRAINT "BatchLot_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_binId_fkey" FOREIGN KEY ("binId") REFERENCES "WarehouseBin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BatchLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkCenter" ADD CONSTRAINT "WorkCenter_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BatchLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QualityInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BatchLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchNote" ADD CONSTRAINT "DispatchNote_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchNote" ADD CONSTRAINT "DispatchNote_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "DispatchNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReport" ADD CONSTRAINT "SiteReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReport" ADD CONSTRAINT "SiteReport_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "SiteVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteIssue" ADD CONSTRAINT "SiteIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteIssue" ADD CONSTRAINT "SiteIssue_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialConsumption" ADD CONSTRAINT "MaterialConsumption_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialConsumption" ADD CONSTRAINT "MaterialConsumption_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SiteReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ServiceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "DispatchNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "VendorBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetItem" ADD CONSTRAINT "AssetItem_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorTarget" ADD CONSTRAINT "DistributorTarget_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemeClaim" ADD CONSTRAINT "SchemeClaim_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "Scheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemeClaim" ADD CONSTRAINT "SchemeClaim_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
