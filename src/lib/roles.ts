/**
 * Los tres rangos y como se comparan. Sin imports a proposito.
 *
 * Vivio dentro de `lib/auth.ts` y el build lo rechazo: `nav-items.ts` necesita
 * `hasRole` para decidir que modulos pintar, lo usa la navegacion movil que es
 * un componente cliente, y por esa cadena el bundle del navegador terminaba
 * arrastrando el cliente de Postgres. Un dato tan simple como "que rango es
 * mayor" no puede depender de la sesion ni de la base.
 */
export const ADVISOR_ROLES = ["asesor", "supervisor", "admin"] as const;

export type AdvisorRole = (typeof ADVISOR_ROLES)[number];

/**
 * El orden de la jerarquia. Es el mismo orden del enum en la base y el mismo de
 * `ADVISOR_ROLES`: los tres tienen que contar la misma historia.
 *
 * - `asesor`: los cinco modulos de su trabajo diario.
 * - `supervisor`: todo lo del administrador MENOS las cuentas, incluidas las
 *   analiticas y las practicas de cada asesora: el seguimiento es su trabajo.
 * - `admin`: todo, incluidas cuentas e invitaciones.
 */
const roleRank: Record<AdvisorRole, number> = { asesor: 0, supervisor: 1, admin: 2 };

/**
 * Si `role` alcanza el rango pedido.
 *
 * Un rango mayor incluye lo que puede el menor, asi que `hasRole("admin",
 * "supervisor")` es verdadero. Sin esto habria que enumerar los roles
 * permitidos en cada llamada, y el dia que entre un cuarto rango habria que
 * revisar todas.
 */
export function hasRole(role: AdvisorRole, requiredRole: AdvisorRole) {
  return roleRank[role] >= roleRank[requiredRole];
}

/**
 * Como se lee cada rango en pantalla.
 *
 * Nombres de FUNCION y no de persona: "Asesora", "Supervisora" y
 * "Administradora" le ponen genero a un rango que no lo tiene, y quien ocupe el
 * puesto no siempre es mujer. Nombrar la funcion —asesoria, supervision,
 * administracion— dice lo mismo sin suponer quien la ejerce.
 *
 * Viven aca, junto a la jerarquia, porque ya habia tres copias de este mapa en
 * tres pantallas: la barra de sesion, el directorio de cuentas y las
 * analiticas. Tres copias de la misma verdad se desvian, y de hecho se
 * desviaron —dos de ellas nunca supieron del rango de supervision—.
 */
export const ROLE_LABELS: Record<AdvisorRole, string> = {
  asesor: "Asesoría",
  supervisor: "Supervisión",
  admin: "Administración",
};
