export type NavigationRole = "asesor" | "admin";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  glyph: string;
  adminOnly?: boolean;
};

const navItems = [
  { href: "/app", label: "Inicio", description: "Resumen del equipo", glyph: "IN" },
  {
    href: "/app/training",
    label: "Training",
    description: "Practica antes del live",
    glyph: "TR",
  },
  {
    href: "/app/copilot",
    label: "Copilot",
    description: "Responde durante el live",
    glyph: "CO",
  },
  {
    href: "/app/intelligence",
    label: "Intelligence",
    description: "Aprende después del live",
    glyph: "LI",
  },
  {
    href: "/app/knowledge",
    label: "Knowledge",
    description: "Fuente de verdad",
    glyph: "KH",
  },
  {
    href: "/app/settings",
    label: "Settings",
    description: "Reglas y cuentas",
    glyph: "ST",
    adminOnly: true,
  },
] satisfies NavItem[];

export function visibleNavItems(role: NavigationRole) {
  return navItems.filter((item) => !item.adminOnly || role === "admin");
}
