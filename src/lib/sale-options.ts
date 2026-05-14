export const SALE_CHANNELS = ["not_sold", "ebay", "fb", "instagram", "in_person", "traded"] as const;

export type SaleChannel = (typeof SALE_CHANNELS)[number];

export const SALE_CHANNEL_LABELS: Record<SaleChannel, string> = {
  not_sold: "----",
  ebay: "Ebay",
  fb: "FB",
  instagram: "Instagram",
  in_person: "In Person",
  traded: "Traded",
};
