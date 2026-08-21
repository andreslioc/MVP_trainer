import type { SimSpeed } from "../../../../../lib/simulator/chat-player.ts";

/**
 * Velocidad del chat del simulacro.
 *
 * `aleatorio` es el predeterminado porque un chat real llega en rachas, con
 * silencios en medio. Un intervalo constante se anticipa a los pocos segundos,
 * y anticiparlo es lo contrario de entrenar atencion.
 */
export const SPEED_OPTIONS: ReadonlyArray<{ value: SimSpeed; label: string; hint: string }> =
  Object.freeze([
    { value: "despacio", label: "Despacio", hint: "1 cada 4 s" },
    { value: "normal", label: "Normal", hint: "1 cada 2 s" },
    { value: "rapido", label: "Rápido", hint: "1 por segundo" },
    { value: "aleatorio", label: "Aleatorio", hint: "en rachas, como un live" },
  ]);

export const DEFAULT_SPEED: SimSpeed = "aleatorio";

export function SpeedChoice({
  value,
  disabled,
  onChange,
}: {
  value: SimSpeed;
  disabled: boolean;
  onChange: (speed: SimSpeed) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-fg">Velocidad del chat</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {SPEED_OPTIONS.map((option) => (
          <label
            className={`min-h-11 rounded-card border p-2 text-center text-sm ${
              value === option.value ? "border-primary bg-confidence-high-bg" : "border-border"
            }`}
            key={option.value}
          >
            <input
              checked={value === option.value}
              className="mr-1"
              disabled={disabled}
              name="velocidad"
              onChange={() => onChange(option.value)}
              type="radio"
              value={option.value}
            />
            <span className="font-semibold">{option.label}</span>
            <span className="block text-xs text-fg-muted">{option.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
