import Link from "next/link";
import OrderForm from "../OrderForm";
import { loadOrderInventory } from "../order-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Add Order - OWL Market",
};

export default async function NewOrderPage() {
  const { data: inventoryItems, error } = await loadOrderInventory();

  return (
    <section className="mx-auto max-w-[1600px] px-5 py-8 sm:px-7 lg:px-10 xl:px-12">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Internal Tool</p>
          <h1 className="admin-title">Add Order</h1>
          <p className="admin-subline">
            Search inventory, bundle selected cards, and create a customer order for shipping.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/inventory?status=ship"
            className="rounded-md border border-border bg-surface px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:text-owl"
          >
            Back to Inventory
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-loss/30 bg-loss/10 p-4 text-base text-text">
          Orders are not ready yet: {error}. Run schema-migration-v18-customer-orders.sql in Supabase.
        </div>
      ) : (
        <OrderForm inventoryItems={inventoryItems} />
      )}
    </section>
  );
}
