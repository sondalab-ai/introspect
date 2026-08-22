export interface NavItem {
  label: string;
  badge?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { title: "Realtime", items: [{ label: "Live graph", badge: "●" }] },
  {
    title: "Configuration",
    items: [
      { label: "System prompt" },
      { label: "Skills" },
      { label: "Agents" },
      { label: "Commands" },
      { label: "Memories" },
      { label: "Hooks · Perms · Env" },
      { label: "Plugins" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { label: "Projects" },
      { label: "Sessions · History" },
      { label: "Debug" },
    ],
  },
  { title: "Portabilità", items: [{ label: "Export bundle" }] },
];
