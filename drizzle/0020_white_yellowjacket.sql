-- Extrae los casos de no uso que ya estaban escritos dentro de `precautions`.
--
-- El texto del catalogo los nombra literalmente: "Consulta a tu medico antes de
-- usar si estas embarazada, en lactancia, tomas medicamentos o tienes alguna
-- condicion medica. Mantener fuera del alcance de los ninios." Eso no es una
-- inferencia: son las mismas palabras, sacadas del parrafo y puestas en lineas
-- para que se lean en camara.
--
-- `precautions` NO se toca: el parrafo completo sigue siendo el texto legal de
-- la etiqueta, y esta lista es su version leible. Aqui duplicar es correcto —
-- son dos usos distintos del mismo dato— al contrario del modo de uso, que si
-- se movio porque nadie lo leia donde estaba.
update public.products
   set contraindications = (
         select coalesce(jsonb_agg(caso order by orden), '[]'::jsonb)
           from (
             values
               (1, 'Embarazo', '(embarazad|embarazo|gestaci)'),
               (2, 'Lactancia', '(lactancia|amamant)'),
               (3, 'Tratamiento con medicamentos', '(medicament)'),
               (4, 'Condición médica diagnosticada', '(condici[oó]n m[eé]dica|enfermedad)'),
               (5, 'Menores de edad', '(ni[nñ]os|menores)')
           ) as casos(orden, caso, patron)
          where precautions ~* casos.patron
       ),
       updated_at = now()
 where precautions <> ''
   and contraindications = '[]'::jsonb;
