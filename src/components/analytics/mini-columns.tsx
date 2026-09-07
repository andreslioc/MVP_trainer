/**
 * Los dias de la ventana elegida, como columnas.
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
  format,
  labels,
}: {
  data: Array<{ key: string; value: number; label: string }>;
  label: string;
  unit: string;
  /**
   * Como se dice el valor de una columna. Sin el, numero y unidad separados por
   * un espacio, que es lo que sirve para minutos o respuestas.
   *
   * Existe porque el costo no se dice asi: "0.42 US$" mezcla el punto decimal
   * del ingles con la unidad detras. Con formateador queda "US$ 0,42", que es
   * como se lee un precio en Colombia.
   */
  format?: (value: number) => string;
  /**
   * Escribe debajo de cada columna de que dia es.
   *
   * Opcional y apagado por defecto porque depende de para que sirve la grafica.
   * En un calendario de actividad de treinta dias las etiquetas no caben y la
   * forma general es lo que importa. En una de siete, no saber que columna es
   * cada dia obliga a pasar el mouse para leer el grafico — y en un movil no
   * hay mouse. Con mas de diez columnas se ignora: no caben.
   */
  labels?: boolean;
}) {
  if (data.length === 0) return null;
  const maximo = Math.max(...data.map((punto) => punto.value), 1);
  // Con pocas columnas el aire entre ellas es agradable; con treinta, ese mismo
  // aire se come el ancho y deja barras de siete pixeles. Pasadas diez columnas
  // el separador baja a 2px, que es lo justo para que dos barras vecinas se
  // lean como dos y no como un bloque.
  const separacion = data.length > 10 ? "gap-0.5" : "gap-2";
  const decir = (valor: number) => (format ? format(valor) : `${valor} ${unit}`);
  const conEtiquetas = labels === true && data.length <= 10;

  return (
    <figure className="mt-3">
      <figcaption className="sr-only">{label}</figcaption>
      {/*
        Tope de 24px por columna: una barra no llena su banda, el sobrante es
        aire. Sin el tope, con siete dias en una tarjeta ancha las columnas
        salen de 54px y la fila se ve pesada.
      */}
      <ul className={`flex items-end ${separacion} ${ALTO_CLASE}`}>
        {data.map((punto) => {
          // Un minimo visible para el dia que tuvo algo: una fraccion pequeña
          // redondeada a cero se leeria igual que un dia vacio.
          const alto = punto.value === 0 ? 0 : Math.max((punto.value / maximo) * 100, 12);
          return (
            <li
              className={`relative w-full max-w-6 flex-1 overflow-hidden rounded bg-border ${ALTO_CLASE}`}
              key={punto.key}
              title={`${punto.label}: ${decir(punto.value)}`}
            >
              {alto > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 rounded bg-primary"
                  style={{ height: `${alto}%` }}
                />
              ) : null}
              <span className="sr-only">{`${punto.label}: ${decir(punto.value)}`}</span>
            </li>
          );
        })}
      </ul>
      {conEtiquetas ? (
        // El mismo reparto que las columnas —`flex-1` y el mismo tope— para que
        // cada etiqueta caiga bajo la suya y no se corra media columna.
        <ul aria-hidden="true" className={`mt-1 flex ${separacion}`}>
          {data.map((punto) => (
            <li
              className="w-full max-w-6 flex-1 truncate text-center text-[0.625rem] leading-tight text-fg-muted"
              key={punto.key}
            >
              {punto.label}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}
