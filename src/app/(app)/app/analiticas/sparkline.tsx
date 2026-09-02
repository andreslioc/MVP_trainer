/**
 * Linea acumulada con lavado de area y punto final.
 *
 * Area al 10% —un lavado, nunca un bloque saturado—, linea de 2px y el punto
 * final con anillo de superficie para que se lea donde cruza la linea. Es la
 * unica marca etiquetada: un numero en cada punto no se lee.
 */
const ANCHO = 168;
const ALTO = 44;
const MARGEN = 5;

export function Sparkline({
  data,
  label,
}: {
  data: Array<{ key: string; value: number }>;
  label: string;
}) {
  if (data.length < 2) return null;
  const maximo = Math.max(...data.map((d) => d.value), 1);
  const paso = (ANCHO - MARGEN * 2) / (data.length - 1);
  const puntos = data.map((punto, index) => ({
    ...punto,
    x: MARGEN + index * paso,
    y: ALTO - MARGEN - (punto.value / maximo) * (ALTO - MARGEN * 2),
  }));
  const linea = puntos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const ultimo = puntos[puntos.length - 1];

  return (
    <svg
      aria-label={label}
      className="mt-3 h-11 w-full"
      // Alineada a la izquierda: centrada deja un margen que no coincide con el
      // de las columnas de las tarjetas de arriba, y las dos filas se ven
      // desalineadas dentro de la misma pantalla.
      preserveAspectRatio="xMinYMid meet"
      role="img"
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
    >
      <polygon
        className="fill-primary opacity-10"
        points={`${MARGEN},${ALTO} ${linea} ${ANCHO - MARGEN},${ALTO}`}
      />
      <polyline
        className="stroke-primary"
        fill="none"
        points={linea}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      {ultimo ? (
        <circle
          className="fill-primary stroke-surface"
          cx={ultimo.x}
          cy={ultimo.y}
          r={4}
          strokeWidth={2}
        >
          <title>{`${label}: ${ultimo.value}`}</title>
        </circle>
      ) : null}
    </svg>
  );
}
