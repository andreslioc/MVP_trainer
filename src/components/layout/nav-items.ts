import { type AdvisorRole, hasRole } from "../../lib/roles.ts";

export type NavigationRole = AdvisorRole;

export type NavItem = {
  href: string;
  label: string;
  description: string;
  glyph: string;
  /**
   * Rango minimo que ve el modulo. Ausente significa que lo ve cualquiera.
   *
   * Es un rango y no una bandera de administrador porque hay tres: con
   * `adminOnly` no se podia expresar "esto lo ve el supervisor y el admin, pero
   * no la asesora", que es justo lo que separa Knowledge y las reglas de las
   * cuentas.
   */
  minRole?: AdvisorRole;
};

const navItems = [
  { href: "/app", label: "Inicio", description: "Resumen del equipo", glyph: "IN" },
  {
    href: "/app/pre-training",
    label: "Pre-training",
    description: "Estudia las fichas",
    glyph: "PT",
  },
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
    // La asesora consume las fichas en Pre-training; editarlas es trabajo de
    // quien responde por lo que se dice al aire.
    minRole: "supervisor",
  },
  {
    href: "/app/settings",
    label: "Reglas",
    description: "Reglas comerciales",
    glyph: "ST",
    minRole: "supervisor",
  },
  {
    href: "/app/cuentas",
    label: "Cuentas",
    description: "Personas y accesos",
    glyph: "CU",
    minRole: "admin",
  },
  {
    href: "/app/analiticas",
    label: "Analíticas",
    description: "Desempeño por persona",
    glyph: "AN",
    minRole: "admin",
  },
] satisfies NavItem[];

export function visibleNavItems(role: NavigationRole) {
  return navItems.filter((item) => !item.minRole || hasRole(role, item.minRole));
}
