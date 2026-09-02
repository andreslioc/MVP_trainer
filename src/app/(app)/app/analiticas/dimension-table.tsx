import type { DimensionScore } from "../../../../server/advisor-analytics.ts";

/** La rubrica escribe llaves con guion bajo; en pantalla se leen en español. */
const nombres: Record<string, string> = {
  conocimiento_producto: "Conocimiento del producto",
  claridad_explicacion: "Claridad de la explicación",
  naturalidad_cercania: "Naturalidad y cercanía",
  uso_responsable_evidencia: "Uso responsable de la evidencia",
  manejo_objeciones: "Manejo de objeciones",
  capacidad_persuasion: "Capacidad de persuasión",
  uso_cta: "Uso del cierre",
  duracion: "Duración",
  cumplimiento_reglas_marca: "Cumplimiento de reglas de marca",
};

/**
 * Las nueve dimensiones como tabla escalonada.
 *
 * Tres columnas: que se evalua, la barra, y la nota a la derecha. Las filas
 * vienen ordenadas de peor a mejor, asi que las barras arman una escalera y lo
 * primero de la lista es donde mas rinde una sesion de acompañamiento.
 *
 * UN SOLO HUE para las nueve. La primera version las pintaba verde, amarillo y
 * rojo segun la nota, y el validador de paletas lo tumbo: el amarillo y el rojo
 * del sistema tienen una separacion de 3.2 en deuteranopia —indistinguibles— y
 * de 14.5 en vision normal, bajo el piso de 15. Ese semaforo funciona como
 * insignia, acompañado de texto, y no como marca de grafica. Lo que ordena la
 * lectura es el orden y el numero, no el color.
 *
 * Numeros tabulares SOLO en la columna de notas: es donde tienen que alinearse
 * verticalmente. En una cifra grande y sola darian un digito suelto.
 */
export function DimensionTable({ dimensions }: { dimensions: DimensionScore[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full min-w-md border-collapse text-left">
        <caption className="sr-only">
          Nota de cada dimensión de la rúbrica, de peor a mejor, sobre una escala de 1 a 5
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-sm font-semibold text-fg-muted" scope="col">
              Qué se evalúa
            </th>
            <th className="w-2/5 px-4 py-3 text-sm font-semibold text-fg-muted" scope="col">
              <span className="sr-only">Comparación</span>
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-fg-muted" scope="col">
              Nota
            </th>
          </tr>
        </thead>
        <tbody>
          {dimensions.map((dimension) => (
            <tr className="border-b border-border last:border-b-0" key={dimension.dimension}>
              <th className="px-4 py-3 text-sm font-normal text-fg" scope="row">
                {nombres[dimension.dimension] ?? dimension.dimension}
              </th>
              <td className="px-4 py-3">
                <div
                  aria-hidden="true"
                  className="h-2 overflow-hidden rounded-full bg-border"
                  title={`${dimension.percent} de 100 · ${dimension.answers} respuestas`}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${dimension.percent}%` }}
                  />
                </div>
              </td>
              <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-fg">
                {dimension.average}
                <span className="font-normal text-fg-muted"> / 5</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
