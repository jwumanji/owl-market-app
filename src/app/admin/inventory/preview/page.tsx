import InventoryShell from "../InventoryShell";
import { InventoryRow } from "../InventoryTabs";

export const metadata = {
  title: "Inventory Preview - Moon Market",
};

const sampleItems: InventoryRow[] = [
  {
    id: "preview-raw-1",
    created_at: "2026-05-01T10:00:00.000Z",
    inventory_type: "raw",
    status: "new",
    quantity: 1,
    graded_rating: null,
    acquired_at: "2026-05-01",
    cost_basis: "12.00",
    purchased_from: "facebook",
    card: {
      name: "Monkey.D.Luffy",
      image_url: "https://en.onepiece-cardgame.com/images/cardlist/card/OP05-119.png",
      image_url_small: "https://en.onepiece-cardgame.com/images/cardlist/card/OP05-119.png",
      card_number: "OP05-119",
      set_code: "OP05",
    },
  },
  {
    id: "preview-raw-1b",
    created_at: "2026-05-02T10:00:00.000Z",
    inventory_type: "raw",
    status: "ship",
    quantity: 1,
    graded_rating: null,
    acquired_at: "2026-05-02",
    cost_basis: "18.50",
    purchased_from: "ebay",
    customer_name: "Tony Tony Chopper",
    shipping_tracking: "1Z999AA10123456784",
    shipping_label_url: "https://example.com/labels/luffy",
    shipped_at: null,
    sale_channel: "ebay",
    sold_date: null,
    sold_price: null,
    card: {
      name: "Monkey.D.Luffy",
      image_url: "https://en.onepiece-cardgame.com/images/cardlist/card/OP05-119.png",
      image_url_small: "https://en.onepiece-cardgame.com/images/cardlist/card/OP05-119.png",
      card_number: "OP05-119",
      set_code: "OP05",
    },
  },
  {
    id: "preview-raw-1c",
    created_at: "2026-05-03T10:00:00.000Z",
    inventory_type: "damaged",
    status: "new",
    quantity: 1,
    graded_rating: null,
    acquired_at: "2026-05-03",
    cost_basis: "8.00",
    purchased_from: "event",
    card: {
      name: "Monkey.D.Luffy",
      image_url: "https://en.onepiece-cardgame.com/images/cardlist/card/OP05-119.png",
      image_url_small: "https://en.onepiece-cardgame.com/images/cardlist/card/OP05-119.png",
      card_number: "OP05-119",
      set_code: "OP05",
    },
  },
  {
    id: "preview-raw-2",
    created_at: "2026-05-04T10:00:00.000Z",
    inventory_type: "raw",
    status: "sale",
    quantity: 1,
    graded_rating: null,
    acquired_at: "2026-05-04",
    cost_basis: "20.00",
    purchased_from: "instagram",
    sale_channel: "not_sold",
    sold_date: null,
    sold_price: null,
    card: {
      name: "Nami",
      image_url: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-016.png",
      image_url_small: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-016.png",
      card_number: "OP01-016",
      set_code: "OP01",
    },
  },
  {
    id: "preview-damaged-1",
    created_at: "2026-05-05T10:00:00.000Z",
    inventory_type: "damaged",
    status: "new",
    quantity: 1,
    graded_rating: null,
    acquired_at: "2026-05-05",
    cost_basis: "5.00",
    purchased_from: "direct_person",
    card: {
      name: "Roronoa Zoro",
      image_url: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png",
      image_url_small: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png",
      card_number: "OP01-001",
      set_code: "OP01",
    },
  },
  {
    id: "preview-graded-1",
    created_at: "2026-05-06T10:00:00.000Z",
    inventory_type: "graded",
    status: "ship",
    quantity: 1,
    graded_rating: "PSA 10",
    acquired_at: "2026-05-06",
    cost_basis: "80.00",
    purchased_from: "facebook",
    customer_name: "Nico Robin",
    shipping_tracking: "https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=9400111206213900000000",
    shipping_label_url: "Label queued",
    shipped_at: null,
    sale_channel: "instagram",
    sold_date: null,
    sold_price: null,
    card: {
      name: "Trafalgar Law",
      image_url: "https://en.onepiece-cardgame.com/images/cardlist/card/OP05-069.png",
      image_url_small: "https://en.onepiece-cardgame.com/images/cardlist/card/OP05-069.png",
      card_number: "OP05-069",
      set_code: "OP05",
    },
  },
  {
    id: "preview-graded-2",
    created_at: "2026-05-07T10:00:00.000Z",
    inventory_type: "graded",
    status: "sold",
    quantity: 1,
    graded_rating: "BGS 9.5",
    acquired_at: "2026-05-07",
    cost_basis: "90.00",
    purchased_from: "ebay",
    sale_channel: "ebay",
    sold_date: "2026-05-08",
    sold_price: "145.00",
    card: {
      name: "Boa Hancock",
      image_url: "https://en.onepiece-cardgame.com/images/cardlist/card/OP07-051.png",
      image_url_small: "https://en.onepiece-cardgame.com/images/cardlist/card/OP07-051.png",
      card_number: "OP07-051",
      set_code: "OP07",
    },
  },
  {
    id: "preview-sealed-1",
    created_at: "2026-05-08T10:00:00.000Z",
    inventory_type: "sealed",
    status: "new",
    quantity: 1,
    graded_rating: null,
    acquired_at: "2026-05-08",
    cost_basis: "110.00",
    purchased_from: "event",
    card: {
      name: "OP-05 Awakening of the New Era Booster Box",
      image_url: null,
      image_url_small: null,
      card_number: "SEALED",
      set_code: "OP05",
    },
  },
  {
    id: "preview-sealed-2",
    created_at: "2026-05-09T10:00:00.000Z",
    inventory_type: "sealed",
    status: "sale",
    quantity: 1,
    graded_rating: null,
    acquired_at: "2026-05-09",
    cost_basis: "115.00",
    purchased_from: "direct_person",
    sale_channel: "not_sold",
    sold_date: null,
    sold_price: null,
    card: {
      name: "OP-05 Awakening of the New Era Booster Box",
      image_url: null,
      image_url_small: null,
      card_number: "SEALED",
      set_code: "OP05",
    },
  },
];

export default function InventoryPreviewPage() {
  const totalQuantity = sampleItems.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <section className="mx-auto max-w-[1920px] px-5 py-8 sm:px-7 lg:px-10 xl:px-12">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Preview</p>
          <h1 className="admin-title">Inventory</h1>
          <p className="admin-subline">
            Sample view for Raw, Damaged, and Graded inventory stages.
          </p>
        </div>
        <div className="admin-stat-card">
          <div className="lbl">Total Quantity</div>
          <div className="val">{totalQuantity}</div>
        </div>
      </div>

      <InventoryShell items={sampleItems} />
    </section>
  );
}
