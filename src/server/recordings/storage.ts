/**
 * Acceso a Storage para las grabaciones.
 *
 * Vive aparte porque lo comparten los dos pasos de la subida y la retencion, y
 * porque tenerlo detras de un tipo pequeno es lo que permite inyectarlo en las
 * pruebas sin credenciales de Supabase.
 */

import { createAdminSupabaseClient } from "../../lib/auth.ts";
import type { RecordingStorage } from "./upload.ts";

export function defaultStorageFor(bucket: string): RecordingStorage {
  const storage = createAdminSupabaseClient().storage.from(bucket);
  return {
    createSignedUploadUrl: (path) => storage.createSignedUploadUrl(path),
    createSignedUrl: (path, expiresIn) => storage.createSignedUrl(path, expiresIn),
    exists: async (path) => {
      const slash = path.lastIndexOf("/");
      const folder = slash === -1 ? "" : path.slice(0, slash);
      const name = path.slice(slash + 1);
      const { data } = await storage.list(folder, { search: name, limit: 1 });
      return Boolean(data?.some((item) => item.name === name));
    },
    remove: (paths) => storage.remove(paths),
  };
}
