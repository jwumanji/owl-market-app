import { redirect } from "next/navigation";

export const metadata = {
  title: "Markets — OWL Market",
  description: "Top cards ranked by market value.",
};

export default function MarketsPage() {
  redirect("/games/one-piece/markets");
}
