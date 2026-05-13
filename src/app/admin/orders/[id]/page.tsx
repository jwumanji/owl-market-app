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
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-text-2">Nickname Order</p>
          <h1 className="text-4xl font-black tracking-tight text-owl">{orderTitle}</h1>
          <p className="mt-1 font-mono text-sm font-bold uppercase tracking-wider text-text-2">
            Order #{orderNumber}
          </p>
          <p className="mt-3 max-w-2xl text-base text-text">
            Edit the customer details, shipping state, tracking number, and bundled inventory items.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/inventory?status=ship"
            className="rounded-md border border-border bg-surface px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:text-owl"
          >
            Back to Inventory
          </Link>
          <Link
            href="/admin/orders/new"
            className="rounded-md bg-owl px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light"
          >
            Add Order
          </Link>
        </div>
      </div>

      {error || !orderResult.data ? (
        <div className="rounded-lg border border-loss/30 bg-loss/10 p-4 text-base text-text">
          Order query failed: {error ?? "Order not found"}
        </div>
      ) : (
        <OrderForm inventoryItems={inventoryResult.data} initialOrder={orderResult.data} />
      )}
    </section>
  );
}
