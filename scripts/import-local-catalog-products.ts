import { readFileSync } from "node:fs";

import { loadEnv } from "../src/lib/load-env.ts";

loadEnv();

type CatalogProduct = {
  sku: string;
  nombre: string;
  imagen: string;
  categoria: string;
  marca: string;
  descripcion: string;
  beneficios: string[];
  dosis: string;
  presentacion: string;
  ingredientes: string[];
  advertencias: string;
  precioBase: number;
};

const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);

function assertLocalDatabase(databaseUrl: string) {
  const host = new URL(databaseUrl).hostname;
  if (!localHosts.has(host)) {
    throw new Error(`Importación rechazada: DIRECT_DATABASE_URL apunta a ${host}, no a local.`);
  }
}

function ingredientName(value: string) {
  return value
    .replace(/\s+\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ui|iu)\b/giu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function capsuleCount(presentation: string) {
  return presentation.match(/\b(\d+)\s*(?:cápsulas|capsulas|cap)\b/i)?.[1];
}

function neutralBenefits(product: CatalogProduct) {
  const count = capsuleCount(product.presentacion);
  const ingredients = product.ingredientes.map(ingredientName).filter(Boolean);
  return [
    {
      rank: 1,
      claim: "Presentación en cápsulas",
      science_note: "Formato declarado en el catálogo de origen; pendiente de revisión humana.",
      evidence_level: "baja" as const,
    },
    {
      rank: 2,
      claim:
        ingredients.length > 1
          ? `Combina ${ingredients.slice(0, 2).join(" y ")}`
          : `Contiene ${ingredients[0] ?? "el ingrediente declarado en el catálogo"}`,
      science_note: "Ingredientes importados del catálogo de origen; pendientes de verificación.",
      evidence_level: "baja" as const,
    },
    {
      rank: 3,
      claim: count ? `Frasco con ${count} cápsulas` : product.presentacion,
      science_note: "Presentación informada por el catálogo de origen; pendiente de verificación.",
      evidence_level: "baja" as const,
    },
  ];
}

function neutralDescription(product: CatalogProduct) {
  const ingredients = product.ingredientes.map(ingredientName).filter(Boolean);
  const content = ingredients.length ? ingredients.join(" y ") : product.nombre;
  return `Suplemento en cápsulas con ${content}. ${product.presentacion}.`;
}

function currentCatalogImageUrl(value: string) {
  const oldUploads = "https://product-master--nexus.replit.app/objects/uploads/";
  const oldPrivate = "https://product-master--nexus.replit.app/objects/.private/";
  const r2 = "https://pub-74be3f08e8ab44c490fe4d652d79a419.r2.dev/";
  if (value.startsWith(oldUploads)) return value.replace(oldUploads, `${r2}uploads/`);
  if (value.startsWith(oldPrivate)) return value.replace(oldPrivate, r2);
  return value;
}

function adaptProduct(product: CatalogProduct) {
  return {
    sku: product.sku,
    name: product.nombre,
    brand: product.marca,
    category: product.categoria,
    presentation: product.presentacion,
    format: "Cápsulas",
    imageUrl: currentCatalogImageUrl(product.imagen),
    description: neutralDescription(product),
    activeIngredients: product.ingredientes.map((name) => ({
      name: ingredientName(name),
      verified: false,
    })),
    benefits: neutralBenefits(product),
    faqs: [],
    objections: [],
    differentiators: [],
    priceCop: product.precioBase > 0 ? product.precioBase : null,
    precautions: product.advertencias,
    claimsAllowed: [`Es un suplemento en cápsulas de la marca ${product.marca}.`],
    claimsCaution: [
      `Descripción del catálogo pendiente de verificación: ${product.descripcion}`,
      ...product.beneficios.map(
        (benefit) => `Beneficio informado por el catálogo pendiente de verificación: ${benefit}`,
      ),
      ...(product.dosis
        ? [`Uso informado por el catálogo pendiente de verificación: ${product.dosis}`]
        : []),
    ],
    claimsForbidden: [
      "Cura enfermedades",
      "Trata enfermedades",
      "Previene enfermedades",
      "Garantiza resultados",
    ],
    complementProductIds: [],
    sources: [
      {
        label: "Catálogo local productos.json",
        note: "Información importada como borrador; requiere verificación humana antes de publicarse.",
      },
    ],
    verifiedAt: null,
  };
}

async function main() {
  const [catalogPath, ...requestedSkus] = process.argv.slice(2);
  if (!catalogPath || requestedSkus.length === 0) {
    throw new Error("Uso: pnpm tsx scripts/import-local-catalog-products.ts <json> <sku...>");
  }

  const [{ openDirectDatabase }, { products }, { env }, { productInputSchema }] = await Promise.all(
    [
      import("../src/db/client.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/env.ts"),
      import("../src/lib/validation/product.ts"),
    ],
  );
  assertLocalDatabase(env.DIRECT_DATABASE_URL);

  const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as CatalogProduct[];
  const bySku = new Map(catalog.map((product) => [product.sku.toLowerCase(), product]));
  const selected = requestedSkus.map((sku) => {
    const product = bySku.get(sku.toLowerCase());
    if (!product) throw new Error(`No se encontró el SKU ${sku} en el catálogo.`);
    return productInputSchema.parse(adaptProduct(product));
  });

  const connection = openDirectDatabase("dev");
  try {
    // Una sola escritura y sin sobrescribir fichas existentes: repetir el
    // comando es seguro y conserva cualquier revisión humana posterior.
    const inserted = await connection.db
      .insert(products)
      .values(selected)
      .onConflictDoNothing()
      .returning({ sku: products.sku, name: products.name });
    const insertedSkus = new Set(inserted.map((product) => product.sku));
    for (const product of selected) {
      const status = insertedSkus.has(product.sku ?? null)
        ? "importado"
        : "ya existía; sin cambios";
      console.info(`${product.sku}: ${status}`);
    }
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido al importar.");
  process.exitCode = 1;
});
