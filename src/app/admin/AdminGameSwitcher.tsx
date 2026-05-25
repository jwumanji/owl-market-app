"use client";

type AdminGameOption = {
  slug: string;
  name: string;
  isPublic: boolean;
};

export default function AdminGameSwitcher({
  activeGameSlug,
  games,
}: {
  activeGameSlug: string;
  games: AdminGameOption[];
}) {
  if (games.length <= 1) return null;

  function handleGameChange(nextGameSlug: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("game", nextGameSlug);
    window.location.assign(`${url.pathname}?${url.searchParams.toString()}`);
  }

  return (
    <label className="admin-game-switcher">
      <span>Active Game</span>
      <select
        defaultValue={activeGameSlug}
        onChange={(event) => handleGameChange(event.target.value)}
      >
        {games.map((game) => (
          <option key={game.slug} value={game.slug}>
            {game.name}{game.isPublic ? "" : " (Preview)"}
          </option>
        ))}
      </select>
    </label>
  );
}
