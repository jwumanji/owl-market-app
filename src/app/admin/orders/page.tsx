import Link from "next/link";
import { loadOrderSummaries } from "./order-data";
import type { CustomerOrderSummary, OrderInventoryItem } from "./order-types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Orders - OWL Market",
};

function itemTitle(item: OrderInventoryItem) {
  return item.item_nickname || item.card.name || "Untitled inventory item";
}

function groupOrderItems(items: OrderInventoryItem[]) {
  const groups = new Map<string, OrderInventoryItem[]>();
  items.forEach((item) => {
    const key = [item.inventory_type.toUpperCase(), item.card.set_code ?? "NO SET"].join(" / ");
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  return Array.from(groups.entries());
}

function formatDate(value?: string | null) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function OrderCard({ order }: { order: CustomerOrderSummary }) {
  return (
    <Link
      href={`/admin/orders/${order.id}`}
      className="group grid gap-4 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-2 hover:bg-surf2"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-xs font-bold uppercase tracking-wider text-owl">{order.id}</div>
          <h2 className="mt-1 truncate text-xl font-bold text-text group-hover:text-owl">
            {order.nickname || order.customer_name}
          </h2>
          <div className="mt-1 truncate text-sm text-text-2">{order.customer_name}</div>
        </div>
        <span
          className={`shrink-0 rounded border px-2 py-1 font-mono text-[10px] font-bold uppercase ${
            order.marked_shipped
              ? "border-gain/30 bg-gain/10 text-gain"
              : "border-owl/30 bg-owl/10 text-owl"
          }`}
        >
          {order.marked_shipped ? "Shipped" : "Open"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-deep p-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-2">Cards</div>
          <div className="mt-1 text-2xl font-bold text-text">{order.items.length}</div>
        </div>
        <div className="rounded-md border border-border bg-deep p-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-2">Tracking</div>
          <div className="mt-1 truncate font-mono text-sm font-semibold text-text">
            {order.tracking_number || "None"}
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        {groupOrderItems(order.items).map(([group, items]) => (
          <div key={group} className="rounded-md border border-border bg-deep">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-2">{group}</span>
              <span className="font-mono text-xs font-bold text-text">{items.length}</span>
            </div>
            <div className="grid gap-1 p-2">
              {items.slice(0, 4).map((item) => (
                <div key={item.id} className="truncate text-sm text-text">
                  {itemTitle(item)}
                </div>
              ))}
              {items.length > 4 && (
                <div className="font-mono text-xs font-semibold text-text-2">+{items.length - 4} more</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3 font-mono text-xs text-text-2">
        <span>{formatDate(order.created_at)}</span>
        <span>Edit</span>
      </div>
    </Link>
  );
}

export default async function OrdersPage() {
  const { data: orders, error } = await loadOrderSummaries();
  const openCount = orders.filter((order) => !order.marked_shipped).length;
  const shippedCount = orders.length - openCount;
  const cardCount = orders.reduce((sum, order) => sum + order.items.length, 0);

  return (
    <section className="mx-auto max-w-[1600px] px-5 py-8 sm:px-7 lg:px-10 xl:px-12">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">Internal Tool</p>
          <h1 className="text-4xl font-bold tracking-tight text-text">Orders</h1>
          <p className="mt-2 max-w-2xl text-base text-text">
            Customer order bundles created from existing inventory items.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/inventory"
            className="rounded-md border border-border bg-surface px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:text-owl"
          >
            Inventory
          </Link>
          <Link
            href="/admin/orders/new"
            className="rounded-md bg-owl px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light"
          >
            Add Order
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-loss/30 bg-loss/10 p-4 text-base text-text">
          Orders are not ready yet: {error}. Run schema-migration-v18-customer-orders.sql in Supabase.
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="font-mono text-sm font-semibold uppercase tracking-wider text-text">Orders</div>
              <div className="mt-2 text-3xl font-bold text-text">{orders.length}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="font-mono text-sm font-semibold uppercase tracking-wider text-text">Open</div>
              <div className="mt-2 text-3xl font-bold text-text">{openCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="font-mono text-sm font-semibold uppercase tracking-wider text-text">Shipped</div>
              <div className="mt-2 text-3xl font-bold text-text">{shippedCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="font-mono text-sm font-semibold uppercase tracking-wider text-text">Cards</div>
              <div className="mt-2 text-3xl font-bold text-text">{cardCount}</div>
            </div>
          </div>

          {orders.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center">
              <h2 className="text-xl font-bold text-text">No orders yet</h2>
              <p className="mt-2 text-sm text-text-2">Create the first customer order from inventory.</p>
              <Link
                href="/admin/orders/new"
                className="mt-5 inline-flex rounded-md bg-owl px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light"
              >
                Add Order
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
