import Image from "next/image";

/**
 * El logo de Galleon 7, en la version que corresponde al fondo.
 *
 * El imagotipo del manual lleva el texto en azul profundo, que sobre el fondo
 * oscuro queda en 1.3:1 — practicamente invisible. Es lo unico que el sistema de
 * tokens no puede resolver solo: no es un color que cambiar sino un ARCHIVO
 * distinto, y por eso hace falta el variante `dark:`.
 *
 * Las dos versiones se pintan y una se oculta con CSS, sin JavaScript: asi el
 * logo correcto ya esta en el primer frame, tambien cuando manda el tema del
 * dispositivo y el servidor no sabia cual iba a ser.
 */

/** El imagotipo completo, o solo el escudo cuando el espacio es estrecho. */
export type BrandLogoShape = "imagotipo" | "isotipo";

const assets: Record<
  BrandLogoShape,
  { claro: string; oscuro: string; width: number; height: number }
> = {
  imagotipo: {
    claro: "/galleon-imagotipo.png",
    oscuro: "/galleon-imagotipo-blanco.png",
    width: 620,
    height: 125,
  },
  isotipo: {
    claro: "/galleon-isotipo.png",
    oscuro: "/galleon-isotipo-blanco.png",
    width: 220,
    height: 186,
  },
};

export function BrandLogo({
  className = "",
  priority = false,
  shape = "imagotipo",
}: {
  /** El tamaño lo pone quien lo usa: el logo no decide cuanto ocupa. */
  className?: string;
  priority?: boolean;
  shape?: BrandLogoShape;
}) {
  const asset = assets[shape];
  return (
    <>
      <Image
        alt="Galleon 7"
        className={`${className} dark:hidden`.trim()}
        height={asset.height}
        priority={priority}
        src={asset.claro}
        width={asset.width}
      />
      {/* `alt` vacio: es la misma marca dos veces y anunciarla dos veces la
          repetiria en el lector de pantalla. */}
      <Image
        alt=""
        className={`hidden ${className} dark:block`.trim()}
        height={asset.height}
        priority={priority}
        src={asset.oscuro}
        width={asset.width}
      />
    </>
  );
}
