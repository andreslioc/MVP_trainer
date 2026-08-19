/**
 * Campo del chat del live, compartido por las dos formas de cargar un live.
 *
 * El chat nunca llega del proveedor de transcripcion —Deepgram y Groq oyen el
 * audio, y las clientas escriben, no hablan—, asi que se pega a mano tanto si
 * se sube el audio como si se pega la transcripcion. Vive aparte para que no
 * haya dos copias del mismo campo divergiendo.
 */
export function ChatLogField({
  value,
  onChange,
  disabled,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  id: string;
}) {
  return (
    <>
      <label className="mt-4 block text-sm font-semibold text-fg" htmlFor={id}>
        Chat del live (opcional)
      </label>
      <p className="mt-1 text-sm text-fg-muted">
        Pega los mensajes del chat para analizar cuáles preguntas fueron respondidas. Un mensaje por
        línea.
      </p>
      <textarea
        className="mt-2 min-h-24 w-full rounded-card border border-border-control bg-surface p-3 text-fg"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder="usuario123: ¿es seguro en el embarazo?&#10;maria_shop: ¿cuál es el beneficio?"
        value={value}
      />
    </>
  );
}
