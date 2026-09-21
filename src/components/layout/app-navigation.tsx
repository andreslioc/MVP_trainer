import { NavLink } from "./nav-link.tsx";
import { type NavigationRole, visibleNavItems } from "./nav-items.ts";

export function AppNavigation({
  role,
  label,
  collapsed = false,
}: {
  role: NavigationRole;
  label: string;
  collapsed?: boolean;
}) {
  return (
    <nav aria-label={label}>
      <ul className="space-y-1">
        {visibleNavItems(role).map((item) => (
          <li key={item.href}>
            <NavLink collapsed={collapsed} item={item} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
