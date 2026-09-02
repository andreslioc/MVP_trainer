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

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <section className="w-full rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-emerald-700">Super Store Sales OS</p>
        <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Inicia sesión</h1>
        <p className="mt-2 text-sm text-zinc-600">
          El acceso es solo por invitación de una administradora.
        </p>

        {errorMessage ? (
          <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <form action={login} className="mt-6 space-y-4">
          <input name="next" type="hidden" value={params.next ?? "/app"} />
          <label className="block text-sm font-medium text-zinc-800">
            Correo
            <input
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              name="email"
              required
              type="email"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-800">
            Contraseña
            <input
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              minLength={1}
              name="password"
              required
              type="password"
            />
          </label>
          <button
            className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 font-medium text-white hover:bg-emerald-800"
            type="submit"
          >
            Entrar
          </button>
        </form>
      </section>
    </main>
  );
}
