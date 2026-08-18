import { NavLink } from "./nav-link.tsx";
import { type NavigationRole, visibleNavItems } from "./nav-items.ts";

export function AppNavigation({ role, label }: { role: NavigationRole; label: string }) {
  return (
    <nav aria-label={label}>
      <ul className="space-y-1">
        {visibleNavItems(role).map((item) => (
          <li key={item.href}>
            <NavLink item={item} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
