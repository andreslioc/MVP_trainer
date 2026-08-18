export const COPILOT_VIEW_DEFAULTS = {
  variant: "express",
  durationLabels: {
    express: "15–20 s",
    estandar: "30–45 s",
    profunda: "60–90 s",
  },
} as const;

export type CopilotViewVariant = keyof typeof COPILOT_VIEW_DEFAULTS.durationLabels;
