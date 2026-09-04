/**
 * Crea —o repara— la cuenta de administracion de un entorno.
 *
 * Existe por dos huecos que se tocan:
 *
 * 1. Ningun camino del producto puede crear la PRIMERA admin. `inviteAdvisor`
 *    exige ya ser admin, y no hay registro publico: un despliegue nuevo no
 *    tiene por donde empezar.
 * 2. Cuando una fila de `advisors` sobrevive sin su usuario de auth, la cuenta
 *    aparece en el directorio pero no puede entrar, y no hay pantalla que lo
 *    arregle. Cinco tablas apuntan a `advisors.id` con `on delete cascade`, asi
 *    que borrar la fila y rehacerla se lleva el historial de esa persona por
 *    delante. La salida sin perdida es la contraria: volver a crear el usuario
 *    de auth CON EL MISMO UUID que la fila ya tiene. `createUser` acepta un id
 *    explicito justo para esto, y la fila se reengancha sola.
 *
 * Usa la conexion DIRECTA y la secret key: es un paso de operacion, nunca algo
 * que corra al arrancar la app. Los imports de la base son dinamicos y van
 * despues de `loadEnv()`, como en `seed.ts`: `src/db/client.ts` lee el entorno
 * al evaluarse, y un import estatico se hoistea por encima de la carga del .env.
 *
 * Uso:
 *   pnpm admin:bootstrap <correo> <contrasena> ["Nombre visible"]
 */

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";

import { loadEnv } from "../src/lib/load-env.ts";

loadEnv();

async function main(): Promise<void> {
  const [email, password, displayName = "Administracion"] = process.argv.slice(2);

  if (!email || !password) {
    throw new Error('Uso: pnpm admin:bootstrap <correo> <contrasena> ["Nombre visible"]');
  }

  const [{ openDirectDatabase }, { advisors }, { env }] = await Promise.all([
    import("../src/db/client.ts"),
    import("../src/db/schema.ts"),
    import("../src/lib/env.ts"),
  ]);

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY. Son las del entorno que quieres " +
        "reparar: apuntar a Supabase local y esperar que arregle produccion es el error " +
        "silencioso de siempre.",
    );
  }

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.admin;

  const connection = openDirectDatabase("dev");

  try {
    const [fila] = await connection.db
      .select()
      .from(advisors)
      .where(eq(advisors.email, email))
      .limit(1);

    // Se pagina a mano porque `listUsers` no filtra por correo. Son las cuentas
    // de un equipo interno, no un padron.
    let usuario: { id: string } | undefined;
    for (let page = 1; page <= 20 && !usuario; page += 1) {
      const { data, error } = await admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      usuario = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (data.users.length < 200) break;
    }

    if (usuario) {
      const { error } = await admin.updateUserById(usuario.id, { password, email_confirm: true });
      if (error) throw error;
      console.info(`Contrasena actualizada para ${email} (auth ${usuario.id}).`);
    } else {
      // El id de la fila huerfana, si existe: es lo que reengancha el historial.
      const { data, error } = await admin.createUser({
        ...(fila ? { id: fila.id } : {}),
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: fila?.displayName ?? displayName },
      });
      if (error) throw error;
      if (!data.user) throw new Error("Supabase no devolvio el usuario creado.");
      usuario = data.user;
      console.info(
        fila
          ? `Usuario de auth recreado con el UUID que la fila ya tenia (${usuario.id}): el historial sigue atado.`
          : `Usuario de auth creado (${usuario.id}).`,
      );
    }

    if (fila) {
      // `resolveVerifiedSession` cierra la sesion de cualquier cuenta que no
      // este `activa`, y `requireRole` la deja fuera de Cuentas si no es admin:
      // las dos cosas se afirman aqui o la reparacion queda a medias.
      await connection.db
        .update(advisors)
        .set({ role: "admin", status: "activa" })
        .where(eq(advisors.id, fila.id));
      console.info(`Fila de advisors ${fila.id} confirmada como admin activa.`);
    } else {
      await connection.db
        .insert(advisors)
        .values({ id: usuario.id, email, displayName, role: "admin", status: "activa" });
      console.info("Fila de advisors creada con rol admin.");
    }

    console.info(`Listo. Entra en /login con ${email}.`);
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido.");
  process.exitCode = 1;
});
