import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";

const connection = openDirectDatabase();

afterAll(async () => {
  await connection.close();
});

describe("database seed", () => {
  it("keeps one row per seeded natural key", async () => {
    const duplicateRules = await connection.db.execute(sql`
      select key from commercial_rules
      group by key having count(*) > 1
    `);
    const duplicatePrompts = await connection.db.execute(sql`
      select name, version from prompts
      group by name, version having count(*) > 1
    `);
    const duplicateProducts = await connection.db.execute(sql`
      select brand, name, presentation from products
      group by brand, name, presentation having count(*) > 1
    `);
    const duplicateQuestions = await connection.db.execute(sql`
      select product_id, text from training_questions where source = 'seed'
      group by product_id, text having count(*) > 1
    `);

    expect(duplicateRules).toHaveLength(0);
    expect(duplicatePrompts).toHaveLength(0);
    expect(duplicateProducts).toHaveLength(0);
    expect(duplicateQuestions).toHaveLength(0);
  });

  it("seeds the complete initial dataset and safe promotion defaults", async () => {
    const [counts] = await connection.db.execute<{
      rules: number;
      prompts: number;
      products: number;
      questions: number;
    }>(sql`
      select
        (select count(*)::int from commercial_rules where key in (
          'originalidad', 'envio_gratis', 'promo_live', 'seguir_tiktok',
          'canal_whatsapp', 'cupon_por_seguir'
        )) as rules,
        (select count(*)::int from prompts where version = 1 and active) as prompts,
        (select count(*)::int from products where brand = 'Super Store Demo') as products,
        (select count(*)::int from training_questions where source = 'seed') as questions
    `);
    const [promotion] = await connection.db.execute<{
      active: boolean;
      threshold_cop: number;
    }>(sql`
      select
        (select active from commercial_rules where key = 'promo_live') as active,
        (select (value->>'threshold_cop')::int from commercial_rules where key = 'envio_gratis') as threshold_cop
    `);

    expect(counts).toEqual({ rules: 6, prompts: 15, products: 1, questions: 4 });
    expect(promotion).toEqual({ active: false, threshold_cop: 120000 });
  });
});
