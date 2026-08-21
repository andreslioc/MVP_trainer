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
      // 8 MB y no 250. El audio de un live ya NO pasa por aqui: va del navegador
      // directo a Storage con una URL firmada, porque Vercel corta cualquier
      // cuerpo sobre ~4,5 MB antes de que el codigo corra y eso no se sube con
      // esta opcion. Lo que si viaja por una server action es el audio de un
      // simulacro —10 minutos a 32 kbps son 2,4 MB— y las transcripciones
      // pegadas a mano, que rondan los cientos de KB.
      bodySizeLimit: "8mb",
    },
    // Existe un proxy.ts, y cuando lo hay Next clona el cuerpo de cada peticion
    // y lo bufferiza para poder leerlo dos veces. El tope por defecto son 10 MB:
    // pasado eso NO falla, trunca en silencio y solo deja un WARN, y el parser
    // recibe un cuerpo cortado y muere con "Unexpected end of form" —un mensaje
    // que no menciona el tamano—. Se mantiene alineado con bodySizeLimit: el
    // costo es memoria, y se bufferiza el cuerpo entero por peticion en curso.
    proxyClientMaxBodySize: "8mb",
  },
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 60, // 1 hora
  },
};

export default nextConfig;
