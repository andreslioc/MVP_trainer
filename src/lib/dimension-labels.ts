/** Etiquetas humanas de las llaves que escribe la rúbrica. */
const DIMENSION_LABELS: Record<string, string> = {
  conocimiento_producto: "Conocimiento del producto",
  claridad_explicacion: "Claridad de la explicación",
  naturalidad_cercania: "Naturalidad y cercanía",
  uso_responsable_evidencia: "Uso responsable de la evidencia",
  manejo_objeciones: "Manejo de objeciones",
  capacidad_persuasion: "Capacidad de persuasión",
  uso_cta: "Uso del cierre",
  duracion: "Duración",
  cumplimiento_reglas_marca: "Cumplimiento de reglas de marca",
};

export function dimensionLabel(key: string) {
  return DIMENSION_LABELS[key] ?? key.replaceAll("_", " ");
}
