import { FolderOpen, LayoutGrid } from "lucide-react";

export const NAV = [
  {
    label: "Library",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutGrid, permission: "documents.view" },
      { href: "/library", label: "Revit Library", icon: FolderOpen, permission: "documents.view" },
    ],
  },
];
