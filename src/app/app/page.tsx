import { redirect } from "next/navigation";

import { getSession } from "../../lib/auth.ts";

export default async function AppPage() {
  const session = await getSession();
  if (!session.ok) {
    redirect("/login?next=/app");
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Hola, {session.data.displayName}</h1>
      <p className="mt-2 text-zinc-600">La sesión está activa y verificada.</p>
    </main>
  );
}
