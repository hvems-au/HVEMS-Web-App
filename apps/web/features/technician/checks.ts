/** The checks on the pre-work and post-work reports (shared by the form and the summaries). */
export const PRE_CHECKS = [
  { id: "walkaround", label: "Walk-around inspection done" },
  { id: "damage", label: "Existing damage recorded (photos below)" },
  { id: "isolation", label: "Isolated and tagged out where needed" },
  { id: "fluids", label: "Fluid levels and leaks checked" },
  { id: "tyres", label: "Tyres, tracks and wheels checked" },
] as const;

export const POST_CHECKS = [
  { id: "tested", label: "Work tested and working" },
  { id: "fluids", label: "Fluids topped up, no leaks" },
  { id: "guards", label: "Guards, covers and panels refitted" },
  { id: "tools", label: "Tools and old parts removed, area clean" },
  { id: "isolation", label: "Isolation removed; ready to use" },
] as const;
