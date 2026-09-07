import { MiniColumns } from "./mini-columns.tsx";
import { Card } from "../ui/card.tsx";
import type { AiCostReport } from "../../server/ai-cost.ts";

/**
 * El gasto de IA por dia, y lo que cuesta una semana normal.
 *
 * El panel tenia un solo acumulado —"US$ 10,91"— que no contesta lo que uno
 * pregunta al verlo: si va subiendo, cuanto es un dia normal, y si el pico de
 * ayer fue trabajo o algo corriendo en vacio. Un total no distingue diez dolares
 * en un dia de diez dolares en un mes.
 *
 * DOS FILAS DE COLUMNAS Y NO UN GRAFICO DE DOBLE EJE. Costo en dolares y numero
 * de llamadas son magnitudes distintas: superponerlas con dos escalas hace que
 * el cruce de las lineas parezca significar algo cuando no significa nada, y es
 * el error mas comun de un panel. Comparten los mismos dias en el mismo orden,
 * asi que la comparacion se lee de arriba abajo — un dia de costo alto con pocas
 * llamadas es una llamada cara, y eso salta a la vista sin dos ejes.
 *
 * Un solo tono en las barras: la altura ya codifica la magnitud. Ninguna columna
 * lleva su numero encima —un numero por punto no se lee—; el valor exacto de un
 * dia esta en su `title` y en el texto para lector de pantalla.
 */
const usd = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Un costo por llamada de $0,004 se redondea a $0,00 con dos decimales y se lee
 * como gratis. Para esa cifra —y solo para esa— hacen falta cuatro.
 */
const usdFino = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

/** `2026-09-05` → `vie 5`. El año no aporta nada en una ventana de una semana. */
function diaCorto(day: string) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

export function AiCostCard({ report, spanLabel }: { report: AiCostReport; spanLabel: string }) {
  const dias = report.days.map((item) => ({
    key: item.day,
    label: diaCorto(item.day),
    value: item.costUsd,
  }));
  const llamadas = report.days.map((item) => ({
    key: item.day,
    label: diaCorto(item.day),
    value: item.calls,
  }));

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-xl font-semibold text-fg">Gasto de IA por día</h2>
        <p className="text-sm text-fg-muted">{spanLabel}</p>
      </div>

      {/*
        La cifra que se buscaba: el promedio POR DIA DE LA VENTANA. Va primero y
        en grande, y el acumulado queda al lado como contexto — al reves, el
        total vuelve a tapar la pregunta.
      */}
      <p className="mt-4 text-4xl font-semibold tabular-nums tracking-tight text-fg">
        {usd.format(report.avgPerDayUsd)}{" "}
        <span className="align-baseline text-base font-normal text-fg-muted">al día</span>
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-fg-muted">Total</dt>
          <dd className="text-lg font-semibold tabular-nums text-fg">
            {usd.format(report.costUsd)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">Llamadas</dt>
          <dd className="text-lg font-semibold tabular-nums text-fg">
            {report.calls.toLocaleString("es-CO")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">Por llamada</dt>
          <dd className="text-lg font-semibold tabular-nums text-fg">
            {report.costPerCallUsd === null ? "—" : usdFino.format(report.costPerCallUsd)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">Día más caro</dt>
          <dd className="text-lg font-semibold tabular-nums text-fg">
            {report.peak
              ? `${diaCorto(report.peak.day)} · ${usd.format(report.peak.costUsd)}`
              : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-5">
        <p className="text-sm font-medium text-fg">Costo</p>
        <MiniColumns
          data={dias}
          format={(value) => usd.format(value)}
          label={`Costo de IA por día, ${spanLabel}`}
          labels
          unit="US$"
        />
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-fg">Llamadas</p>
        <MiniColumns
          data={llamadas}
          label={`Llamadas al modelo por día, ${spanLabel}`}
          labels
          unit="llamadas"
        />
      </div>

      {/*
        La tabla no es un extra de accesibilidad: es donde se lee el numero
        exacto de un dia sin pasar el mouse, y en un movil no hay mouse.
      */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-primary">
          Ver los días en tabla
        </summary>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-fg-muted">
              <th className="py-1 font-medium" scope="col">
                Día
              </th>
              <th className="py-1 text-right font-medium" scope="col">
                Costo
              </th>
              <th className="py-1 text-right font-medium" scope="col">
                Llamadas
              </th>
            </tr>
          </thead>
          <tbody>
            {report.days.map((item) => (
              <tr className="border-t border-border" key={item.day}>
                <th className="py-1 text-left font-normal text-fg" scope="row">
                  {diaCorto(item.day)}
                </th>
                <td className="py-1 text-right tabular-nums text-fg">{usd.format(item.costUsd)}</td>
                <td className="py-1 text-right tabular-nums text-fg-muted">{item.calls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}
