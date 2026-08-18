import { redirect } from "next/navigation";

/**
 * La raiz no tiene contenido propio: este producto no tiene superficie publica.
 * `proxy.ts` ya redirige a `/login`, pero esta redireccion existe igual para que
 * la raiz nunca dependa de que el matcher del proxy siga cubriendola. Sin esto,
 * un cambio en el matcher deja expuesta la pagina que dejo el scaffold.
 */
export default function RootPage() {
  redirect("/app");
}
