import type { InventoryStatus, InventoryType, GradedRating } from "@/lib/inventory-options";

export type OrderInventoryItem = {
  id: string;
  created_at: string | null;
  inventory_type: InventoryType;
  status: InventoryStatus;
  item_nickname: string | null;
  graded_rating: GradedRating | null;
  certification_number: string | null;
  custom_image_front_url: string | null;
  customer_name: string | null;
  shipping_tracking: string | null;
  shipping_label_url: string | null;
  shipped_at: string | null;
  card: {
    name: string | null;
    image_url: string | null;
    image_url_small: string | null;
    card_number: string | null;
    set_code: string | null;
  };
};

export type CustomerOrderFormValue = {
  id: string;
  nickname: string | null;
  customer_name: string;
  shipping_label: string | null;
  marked_shipped: boolean;
  tracking_number: string | null;
  inventory_item_ids: string[];
};

export type CustomerOrderSummary = CustomerOrderFormValue & {
  created_at: string | null;
  updated_at: string | null;
  items: OrderInventoryItem[];
};
