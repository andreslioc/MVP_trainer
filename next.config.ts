import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // El bundle del blueprint vive dentro del proyecto (blueprints/super-store-sales-os/).
  // Excluirlo del tracing evita que Next arrastre sus archivos al output.
  outputFileTracingExcludes: {
    "*": ["blueprints/**"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "250mb",
    },
  },
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 60, // 1 hora
  },
};

export default nextConfig;
