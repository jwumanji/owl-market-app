import Link from "next/link";
import { notFound } from "next/navigation";
import { displayCustomerOrderNumber } from "@/lib/customer-orders";
import OrderForm from "../OrderForm";
import { loadOrderForEdit, loadOrderInventory } from "../order-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Order - OWL Market",
};

export default async function EditOrderPage({ params }: { params: { id: string } }) {
  const [orderResult, inventoryResult] = await Promise.all([
    loadOrderForEdit(params.id),
    loadOrderInventory(params.id),
  ]);

  if (!orderResult.error && !orderResult.data) {
    notFound();
  }

  const error = orderResult.error ?? inventoryResult.error;
  const orderTitle = orderResult.data?.nickname?.trim() || orderResult.data?.customer_name || "Customer Order";
  const orderNumber = displayCustomerOrderNumber(orderResult.data?.id ?? params.id);

  return (
    <section className="mx-auto max-w-[1600px] px-5 py-8 sm:px-7 lg:px-10 xl:px-12">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Nickname Order</p>
          <h1 className="admin-title">{orderTitle}</h1>
          <p className="mt-2 font-mono text-[13px] font-bold uppercase tracking-[0.08em] text-ink-2">
            Order #{orderNumber}
          </p>
          <p className="admin-subline">
            Edit the customer details, shipping state, tracking number, and bundled inventory items.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/inventory?status=ship" className="admin-btn admin-btn-ghost">
            Back to Inventory
          </Link>
          <Link href="/admin/orders/new" className="admin-btn admin-btn-primary">
            Add Order
          </Link>
        </div>
      </div>

      {error || !orderResult.data ? (
        <div className="rounded-c-md border-[1.5px] border-coral bg-[#FFE2DD] px-4 py-3 font-grotesk text-sm text-ink">
          Order query failed: {error ?? "Order not found"}
        </div>
      ) : (
        <OrderForm inventoryItems={inventoryResult.data} initialOrder={orderResult.data} />
      )}
    </section>
  );
}
