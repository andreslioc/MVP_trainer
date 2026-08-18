import { redirect } from "next/navigation";

import { ModulePlaceholder } from "../../../../components/layout/module-placeholder.tsx";
import { requireRole } from "../../../../lib/auth.ts";

export default async function SettingsPage() {
  const authorization = await requireRole("admin");
  if (!authorization.ok) {
    redirect("/app");
  }

  return (
    <ModulePlaceholder
      description="Administra las reglas comerciales y las cuentas que pueden acceder al sistema."
      eyebrow="Administración"
      title="Settings"
    />
  );
}
