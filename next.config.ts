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
    // Existe un proxy.ts, y cuando lo hay Next clona el cuerpo de cada peticion
    // y lo bufferiza para poder leerlo dos veces. El tope por defecto son 10 MB:
    // pasado eso NO falla, trunca en silencio y solo deja un WARN. El parser de
    // multipart recibe entonces un cuerpo cortado a la mitad y muere con
    // "Unexpected end of form", un mensaje que no menciona ni el tamano ni el
    // limite y que aparece atribuido a la pagina. Subir un audio de 127 MB era
    // imposible por esto, no por bodySizeLimit.
    //
    // El costo es memoria: se bufferiza el cuerpo entero por peticion en curso.
    // Nuestro proxy solo lee cookies y jamas toca el cuerpo, asi que este buffer
    // es puro peaje; si algun dia pesa, la salida es mover la subida a un route
    // handler excluido del matcher del proxy.
    proxyClientMaxBodySize: "250mb",
  },
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 60, // 1 hora
  },
};

export default nextConfig;
