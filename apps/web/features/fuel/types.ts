/** Fuel types (matches the fuel_records.fuel_type check). Plain module: safe on server and client. */
export const FUEL_TYPES = { diesel: "Diesel", unleaded: "Unleaded", adblue: "AdBlue", lpg: "LPG", oil: "Oil", other: "Other" } as const;
export type FuelTypeKey = keyof typeof FUEL_TYPES;
