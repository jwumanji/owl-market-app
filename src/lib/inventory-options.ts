export const INVENTORY_TYPES = ["raw", "damaged", "graded", "sealed"] as const;
export const INVENTORY_STATUSES = ["new", "grading", "sale", "ship", "sold"] as const;

export const GRADED_RATINGS = [
  "TAG 10",
  "PSA 10",
  "PSA 9",
  "PSA 8.5",
  "PSA 8",
  "PSA 7.5",
  "PSA 7",
  "PSA 6.5",
  "PSA 6",
  "PSA 5.5",
  "PSA 5",
  "PSA 4.5",
  "PSA 4",
  "PSA 3.5",
  "PSA 3",
  "PSA 2.5",
  "PSA 2",
  "PSA 1.5",
  "PSA 1",
  "PSA Authentic",
  "BGS 10",
  "BGS 9.5",
] as const;

export type InventoryType = (typeof INVENTORY_TYPES)[number];
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];
export type GradedRating = (typeof GRADED_RATINGS)[number];

