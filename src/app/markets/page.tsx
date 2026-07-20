import { redirect } from "next/navigation";

export const metadata = {
  title: "Markets — Moon Market",
  description: "One Piece TCG movers, top cards, box sets, characters, and rarity performance.",
};

export default function MarketsPage() {
  redirect("/games/one-piece/markets");
}
