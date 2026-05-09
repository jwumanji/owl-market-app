import InventoryShell from "../InventoryShell";
import { InventoryRow } from "../InventoryTabs";

export const metadata = {
  title: "Inventory Preview - OWL Market",
};

const sampleItems: InventoryRow[] = [
  {
    id: "preview-raw-1",
    inventory_type: "raw",
    status: "new",
    quantity: 1,
    graded_rating: null,
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
    inventory_type: "raw",
    status: "ship",
    quantity: 1,
    graded_rating: null,
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
    inventory_type: "damaged",
    status: "new",
    quantity: 1,
    graded_rating: null,
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
    inventory_type: "raw",
    status: "sale",
    quantity: 1,
    graded_rating: null,
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
    inventory_type: "damaged",
    status: "new",
    quantity: 1,
    graded_rating: null,
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
    inventory_type: "graded",
    status: "ship",
    quantity: 1,
    graded_rating: "PSA 10",
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
    inventory_type: "graded",
    status: "sold",
    quantity: 1,
    graded_rating: "BGS 9.5",
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
    inventory_type: "sealed",
    status: "new",
    quantity: 1,
    graded_rating: null,
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
    inventory_type: "sealed",
    status: "sale",
    quantity: 1,
    graded_rating: null,
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
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">Preview</p>
          <h1 className="text-4xl font-bold tracking-tight text-text">Inventory</h1>
          <p className="mt-2 max-w-2xl text-base text-text">
            Sample view for Raw, Damaged, and Graded inventory stages.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-right">
          <div className="font-mono text-sm font-semibold uppercase tracking-wider text-text">Total Quantity</div>
          <div className="mt-1 text-3xl font-bold text-text">{totalQuantity}</div>
        </div>
      </div>

      <InventoryShell items={sampleItems} />
    </section>
  );
}
