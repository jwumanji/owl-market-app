import type { GradedRating, InventoryStatus, InventoryType } from "@/lib/inventory-options";
import type { SaleChannel } from "@/lib/sale-options";

export type BundleInventoryItem = {
  id: string;
  created_at: string | null;
  inventory_type: InventoryType;
  status: InventoryStatus;
  quantity: number;
  item_nickname: string | null;
  graded_rating: GradedRating | null;
  certification_number: string | null;
  custom_image_front_url: string | null;
  custom_image_back_url: string | null;
  sale_channel: SaleChannel | null;
  sold_date: string | null;
  sold_price: string | number | null;
  card: {
    name: string | null;
    image_url: string | null;
    image_url_small: string | null;
    card_number: string | null;
    set_code: string | null;
  };
};

export type InventoryBundleFormValue = {
  id: string;
  name: string;
  notes: string | null;
  status: InventoryStatus;
  sale_channel: SaleChannel | null;
  sold_date: string | null;
  sold_price: string | number | null;
  inventory_item_ids: string[];
};

export type InventoryBundleSummary = InventoryBundleFormValue & {
  created_at: string | null;
  updated_at: string | null;
  items: BundleInventoryItem[];
};
