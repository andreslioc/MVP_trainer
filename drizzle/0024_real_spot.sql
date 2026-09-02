-- `full_answer` nacio con DEFAULT 'null'::jsonb, que es el null de JSON y no el
-- NULL de SQL. La diferencia no se ve desde la app —postgres-js entrega null en
-- los dos casos— y si se ve en cualquier consulta: `full_answer IS NULL`
-- devolvia cero filas con 147 fichas sin respuesta escrita.
--
-- Se quita el default y se normaliza lo ya escrito. Las cuatro fichas que si
-- tienen la respuesta guardan un objeto y no las toca.
ALTER TABLE "products" ALTER COLUMN "full_answer" DROP DEFAULT;

UPDATE "products" SET "full_answer" = NULL WHERE "full_answer" = 'null'::jsonb;
