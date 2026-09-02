import { z } from "zod";

/**
 * Tope minimo de la contrasena.
 *
 * Supabase acepta seis por defecto. Aqui son ocho porque estas cuentas ven el
 * catalogo completo y los correos de todo el equipo, y porque subirlo despues
 * obliga a rotar contrasenas ya creadas.
 */
export const PASSWORD_MIN_LENGTH = 8;

export const passwordSchema = z
  .object({
    password: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH,
        `La contraseña necesita al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
      ),
    confirmation: z.string().min(1, "Repite la contraseña."),
  })
  // El campo del error es `confirmation` a proposito: es el que la persona
  // acaba de escribir y el que tiene que corregir. Marcar `password` la manda
  // a revisar el campo que probablemente estaba bien.
  .refine((values) => values.password === values.confirmation, {
    message: "Las dos contraseñas no coinciden.",
    path: ["confirmation"],
  });

export type PasswordInput = z.input<typeof passwordSchema>;
