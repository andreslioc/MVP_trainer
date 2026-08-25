-- Rescata el modo de uso que quedo enterrado en claims_caution.
--
-- El importador del catalogo guardaba la dosis como una frase mas del arreglo,
-- con el prefijo "Uso informado por el catalogo pendiente de verificacion:".
-- Desde ahi era texto invisible: ni la tarjeta ni el Copilot podian leerlo, y
-- nadie iba a copiarlo a mano en 89 fichas.
--
-- Se mueve, no se copia: la frase sale de claims_caution en la misma pasada,
-- porque dejarla en los dos lados hace que una edicion futura cambie una y no
-- la otra.
update public.products p
   set usage_mode = trim(
         regexp_replace(fuente.frase, '^Uso informado por el catálogo pendiente de verificación:\s*', '')
       ),
       claims_caution = coalesce(
         (
           select jsonb_agg(c)
             from jsonb_array_elements_text(p.claims_caution) c
            where c <> fuente.frase
         ),
         '[]'::jsonb
       ),
       updated_at = now()
  from (
    select p2.id,
           (
             select c
               from jsonb_array_elements_text(p2.claims_caution) c
              where c like 'Uso informado por el catálogo%'
              limit 1
           ) as frase
      from public.products p2
  ) as fuente
 where fuente.id = p.id
   and fuente.frase is not null
   and p.usage_mode = '';
