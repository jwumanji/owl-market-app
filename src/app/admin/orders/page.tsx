import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Orders - OWL Market",
};

export default function OrdersPage() {
  redirect("/admin/inventory?status=ship");
}
