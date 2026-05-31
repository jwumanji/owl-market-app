/**
 * Card-name rename helpers for the pregrade Result screen.
 *
 * Extracted from the (now-retired) ResultsPanel so ResultScreen and its tests depend on
 * a small standalone module rather than a large component.
 */

export function reportCardNameDisplay(cardIdentity?: string | null) {
  return cardIdentity?.trim() || "Untitled card";
}

export function reportCardNameKeyAction(key: string) {
  if (key === "Enter") return "commit";
  if (key === "Escape") return "cancel";
  return null;
}

export async function saveReportCardIdentity({
  sessionId,
  cardIdentity,
  fetchImpl = fetch,
}: {
  sessionId?: string | null;
  cardIdentity: string;
  fetchImpl?: typeof fetch;
}) {
  if (!sessionId) {
    throw new Error("A saved pre-grade session id is required.");
  }

  const response = await fetchImpl(`/api/centering/session/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ card_identity: cardIdentity.trim() || null }),
  });

  if (!response.ok) {
    throw new Error(`Could not rename pre-grade (${response.status}).`);
  }

  return response.json() as Promise<unknown>;
}
