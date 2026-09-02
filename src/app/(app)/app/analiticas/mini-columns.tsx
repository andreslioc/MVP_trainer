/**
 * Los ultimos siete dias como columnas.
 *
 * HTML plano y no SVG: con siete columnas fijas, un viewBox obliga a elegir
 * entre centrar la fila —queda flotando en medio de la tarjeta— o deformar las
 * esquinas redondeadas. Un renglon de cajas se estira solo y ocupa el ancho.
 *
 * Un solo hue: la altura ya codifica la magnitud, asi que pintar mas oscuro lo
 * mas alto gastaria el unico canal libre en repetir lo que la barra ya dice.
 * Los dias sin practica se dibujan como riel completo, no se omiten: un
 * calendario con huecos se cuenta de un vistazo.
 */
const ALTO_CLASE = "h-11";

export function MiniColumns({
  data,
  label,
  unit,
}: {
  data: Array<{ key: string; value: number; label: string }>;
  label: string;
  unit: string;
}) {
  if (data.length === 0) return null;
  const maximo = Math.max(...data.map((punto) => punto.value), 1);

  return (
    <figure className="mt-3">
      <figcaption className="sr-only">{label}</figcaption>
      {/*
        Tope de 24px por columna: una barra no llena su banda, el sobrante es
        aire. Sin el tope, con siete dias en una tarjeta ancha las columnas
        salen de 54px y la fila se ve pesada.
      */}
      <ul className={`flex items-end gap-2 ${ALTO_CLASE}`}>
        {data.map((punto) => {
          // Un minimo visible para el dia que tuvo algo: una fraccion pequeña
          // redondeada a cero se leeria igual que un dia vacio.
          const alto = punto.value === 0 ? 0 : Math.max((punto.value / maximo) * 100, 12);
          return (
            <li
              className={`relative w-full max-w-6 flex-1 overflow-hidden rounded bg-border ${ALTO_CLASE}`}
              key={punto.key}
              title={`${punto.label}: ${punto.value} ${unit}`}
            >
              {alto > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 rounded bg-primary"
                  style={{ height: `${alto}%` }}
                />
              ) : null}
              <span className="sr-only">{`${punto.label}: ${punto.value} ${unit}`}</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
