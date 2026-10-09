import type { NavSection } from "@fixotec/ui";
import { BadgePercent, Boxes, Building2, ClipboardList, Download, FileStack, FileText, Folder, FolderOpen, Gift, LayoutDashboard, LifeBuoy, PackageSearch, Receipt, Ruler, ShoppingCart, Tags, Target, Truck } from "lucide-react";
import type { PortalRole } from "../lib/session";

export const MENUS: Record<PortalRole, NavSection[]> = {
  customer: [
    {
      label: "Menu",
      items: [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/projects", label: "Projects", icon: Folder },
        { href: "/rfqs", label: "RFQs", icon: ClipboardList },
        { href: "/quotations", label: "Quotations", icon: FileText },
        { href: "/orders", label: "Orders", icon: ShoppingCart },
        { href: "/deliveries", label: "Deliveries", icon: Truck },
        { href: "/invoices", label: "Invoices", icon: Receipt },
        { href: "/documents", label: "Documents", icon: FolderOpen },
        { href: "/downloads", label: "Downloads", icon: Download },
        { href: "/support", label: "Support", icon: LifeBuoy },
      ],
    },
  ],
  distributor: [
    {
      label: "Menu",
      items: [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/catalogue", label: "Catalogue", icon: PackageSearch },
        { href: "/prices", label: "Price list", icon: Tags },
        { href: "/stock", label: "Availability", icon: Boxes },
        { href: "/orders", label: "Orders", icon: ShoppingCart },
        { href: "/invoices", label: "Invoices", icon: Receipt },
        { href: "/targets", label: "Targets", icon: Target },
        { href: "/schemes", label: "Schemes", icon: Gift },
        { href: "/documents", label: "Marketing", icon: BadgePercent },
      ],
    },
  ],
  consultant: [
    {
      label: "Menu",
      items: [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/projects", label: "Projects", icon: Folder },
        { href: "/engineering", label: "Requests", icon: Ruler },
        { href: "/boq", label: "BOQ", icon: ClipboardList },
        { href: "/submittals", label: "Submittals", icon: FileStack },
        { href: "/catalogue", label: "Products", icon: PackageSearch },
        { href: "/cad", label: "CAD / BIM", icon: Building2 },
        { href: "/downloads", label: "Technical files", icon: Download },
      ],
    },
  ],
};

export const ROLE_LABEL: Record<PortalRole, string> = { customer: "Contractor", distributor: "Distributor", consultant: "Consultant" };
