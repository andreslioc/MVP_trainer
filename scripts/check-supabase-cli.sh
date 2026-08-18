#!/usr/bin/env bash
# Verifica que el CLI de Supabase instalado sea suficientemente nuevo para el
# esquema de supabase/config.toml.
#
# Por que existe: el esquema de config.toml cambia entre versiones del CLI. Un
# CLI viejo rechaza claves nuevas y uno nuevo renombra las viejas, y en ambos
# casos `supabase start` falla con un error que apunta al archivo y no a la
# version. Este script convierte ese error en un mensaje accionable.
#
# Salidas: 0 = version suficiente · 1 = version insuficiente · 2 = no instalado.
set -u

REQUIRED="2.115.0"

if ! command -v supabase >/dev/null 2>&1; then
  echo "ERROR: el CLI de supabase no esta instalado." >&2
  echo "       Requerido: >= ${REQUIRED}" >&2
  echo "       Instala con: brew install supabase/tap/supabase" >&2
  echo "       O descarga: https://github.com/supabase/cli/releases" >&2
  exit 2
fi

# `supabase --version` imprime algo como "2.115.0" o "v2.115.0".
RAW="$(supabase --version 2>/dev/null | head -n1)"
HAVE="$(printf '%s' "$RAW" | tr -cd '0-9.')"

if [ -z "$HAVE" ]; then
  echo "ERROR: no se pudo leer la version del CLI de supabase (salida: '${RAW}')." >&2
  echo "       Requerido: >= ${REQUIRED}" >&2
  exit 2
fi

# sort -V ordena por version. Si el menor de los dos NO es el requerido,
# entonces el instalado es mas viejo que el requerido.
LOWEST="$(printf '%s\n%s\n' "$REQUIRED" "$HAVE" | sort -V | head -n1)"

if [ "$LOWEST" != "$REQUIRED" ] && [ "$HAVE" != "$REQUIRED" ]; then
  echo "ERROR: CLI de supabase ${HAVE} es mas viejo que el requerido ${REQUIRED}." >&2
  echo "       supabase/config.toml fue escrito para >= ${REQUIRED}." >&2
  echo "       Actualiza con: brew upgrade supabase" >&2
  echo "       O descarga: https://github.com/supabase/cli/releases" >&2
  exit 1
fi

echo "CLI de supabase ${HAVE} (requerido >= ${REQUIRED}) OK"
exit 0
