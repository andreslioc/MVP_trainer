import Image from "next/image";

import { BrandLogo } from "../../components/layout/brand-logo.tsx";

import { login } from "./actions.ts";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

const errorMessages: Record<string, string> = {
  FORBIDDEN: "Tu cuenta no está activa. Contacta a una administradora.",
  INVALID_CREDENTIALS: "No pudimos iniciar sesión con esos datos.",
  // Los devuelve `/auth/confirm` cuando el enlace del correo no sirve. Se
  // separan porque la salida es la misma pero la causa no: uno se arregla
  // pidiendo otra invitación, el otro revisando que el enlace llegó completo.
  INVALID_LINK: "El enlace de la invitación no es válido. Pide una invitación nueva.",
  LINK_EXPIRED: "El enlace de la invitación ya se usó o venció. Pide una invitación nueva.",
  UNAUTHENTICATED: "La sesión venció. Inicia sesión otra vez.",
};

const campo =
  "mt-1 min-h-12 w-full rounded-card border border-border-control bg-surface px-3.5 text-fg";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,44%)_minmax(0,56%)]">
      {/*
        Panel de marca: el unico lugar de la app con superficie oscura. Existe
        porque sobre #022f40 el verde menta y el naranja del manual si pasan AA
        como texto, y es donde la marca puede hablar sin competir con datos.
      */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-panel p-14 lg:flex">
        <span
          aria-hidden="true"
          className="absolute -right-40 top-28 size-[38rem] rounded-full bg-brand-panel-glow opacity-35"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-52 -right-16 size-[26rem] rounded-full bg-brand-panel-glow-soft opacity-25"
        />

        <Image
          alt=""
          className="relative h-auto w-24"
          height={186}
          priority
          src="/galleon-isotipo-blanco.png"
          width={220}
        />

        <div className="relative flex flex-col gap-5">
          <p className="font-display text-5xl font-medium leading-tight tracking-tight text-brand-panel-fg text-pretty">
            Todo lo que se dice al aire, respaldado por la ficha.
          </p>
          <p className="max-w-md text-lg leading-relaxed text-brand-panel-muted">
            Entrena antes del live, responde durante, y aprende después. Una sola fuente de verdad
            para las tres cosas.
          </p>
        </div>

        <p className="relative text-sm text-brand-panel-muted">Galleon 7 · Herramienta interna</p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12 md:px-16">
        <section className="w-full max-w-sm">
          <BrandLogo className="h-auto w-48" priority />

          <h1 className="mt-8 font-display text-3xl font-medium tracking-tight text-fg">
            Inicia sesión
          </h1>
          <p className="mt-2 text-fg-muted">
            El acceso es solo por invitación de una cuenta de administración.
          </p>

          {errorMessage ? (
            <p
              className="mt-5 rounded-card border border-destructive bg-confidence-low-bg p-3 text-sm text-confidence-low-fg"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <form action={login} className="mt-7 space-y-5">
            <input name="next" type="hidden" value={params.next ?? "/app"} />
            <label className="block text-sm font-medium text-fg">
              Correo
              <input autoComplete="email" className={campo} name="email" required type="email" />
            </label>
            <label className="block text-sm font-medium text-fg">
              Contraseña
              <input
                autoComplete="current-password"
                className={campo}
                minLength={1}
                name="password"
                required
                type="password"
              />
            </label>
            <button
              className="min-h-12 w-full rounded-card bg-accent px-4 font-bold text-accent-fg hover:bg-accent-ink hover:text-primary-fg"
              type="submit"
            >
              Entrar
            </button>
          </form>

          <p className="mt-6 rounded-card border border-border bg-surface p-3.5 text-sm leading-relaxed text-fg-muted">
            ¿No puedes entrar? Escríbele a quien administra tu cuenta — el acceso no se pide por
            correo.
          </p>
        </section>
      </main>
    </div>
  );
}
