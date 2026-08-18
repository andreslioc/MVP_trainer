const confidencePresentation = {
  alto: { label: "Alto", className: "confidence-badge-high" },
  medio: { label: "Medio", className: "confidence-badge-mid" },
  revisar: { label: "Revisar", className: "confidence-badge-low" },
} as const;

export type ConfidenceLevel = keyof typeof confidencePresentation;

export function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const presentation = confidencePresentation[level];
  return <span className={`confidence-badge ${presentation.className}`}>{presentation.label}</span>;
}
