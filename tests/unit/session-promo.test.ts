import { describe, expect, it } from "vitest";

import { productKnowledgeForPrompt } from "../../src/lib/ai/prompts/generate-questions.ts";
import { promoPercentFor } from "../../src/server/copilot/session.ts";

const ficha = {
  name: "Creatina",
  brand: "Super Store",
  category: "deportivos",
  presentation: "300 g",
  format: "polvo",
  activeIngredients: [],
  benefits: [],
  faqs: [],
  objections: [],
  differentiators: [],
  precautions: "",
  claimsAllowed: [],
  claimsCaution: [],
  claimsForbidden: [],
  sources: [],
  verifiedAt: new Date(),
  priceCop: 189_000,
};

const PRODUCTO = "11111111-1111-4111-8111-111111111111";
const OTRO = "22222222-2222-4222-8222-222222222222";

describe("precio especial de la sesion de live", () => {
  it("aplica solo al producto que lo tiene encendido", () => {
    const promos = [{ product_id: PRODUCTO, percent: 15 }];
    expect(promoPercentFor(promos, PRODUCTO)).toBe(15);
    expect(promoPercentFor(promos, OTRO)).toBeNull();
  });

  it("sin descuento en la sesion, el Copilot dice el precio de lista", () => {
    const conocimiento = productKnowledgeForPrompt(ficha, promoPercentFor([], PRODUCTO));
    expect(conocimiento.price).toBe("$189.000");
    expect(conocimiento.promo_price).toBeNull();
  });

  it("con descuento en la sesion, entrega la cifra ya calculada", () => {
    const promos = [{ product_id: PRODUCTO, percent: 15 }];
    const conocimiento = productKnowledgeForPrompt(ficha, promoPercentFor(promos, PRODUCTO));
    // El modelo nunca multiplica: recibe 161.000 hecho.
    expect(conocimiento.promo_price).toBe("$161.000");
    expect(conocimiento.promo_percent).toBe(15);
  });

  it("el descuento no vive en la ficha: la misma ficha da distinto por sesion", () => {
    // Es el punto entero de moverlo a la sesion. Dos asesoras en dos lives
    // pueden tener precios distintos sobre el mismo producto, y ninguna
    // escribe en `products`.
    const conDescuento = productKnowledgeForPrompt(ficha, 20);
    const sinDescuento = productKnowledgeForPrompt(ficha, null);

    expect(conDescuento.promo_price).toBe("$151.000");
    expect(sinDescuento.promo_price).toBeNull();
    expect(conDescuento.price).toBe(sinDescuento.price);
  });
});
