import type { PreGradeFace, PreGradeSession, PsaCeiling } from "./lens-types";

export type HistoryCeilingFilter = null | 55 | 60 | 999;

export const HISTORY_SEARCH_DEBOUNCE_MS = 300;

export function createDebouncedSearchDispatcher<THandle = ReturnType<typeof setTimeout>>({
  onSearchChange,
  delayMs = HISTORY_SEARCH_DEBOUNCE_MS,
  schedule,
  cancel,
}: {
  onSearchChange: (value: string) => void;
  delayMs?: number;
  schedule?: (callback: () => void, delayMs: number) => THandle;
  cancel?: (handle: THandle) => void;
}) {
  const scheduleTimeout =
    schedule ?? ((callback: () => void, ms: number) => setTimeout(callback, ms) as THandle);
  const cancelTimeout =
    cancel ?? ((handle: THandle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let timeout: THandle | null = null;

  const dispatch = (value: string) => {
    if (timeout) cancelTimeout(timeout);
    timeout = scheduleTimeout(() => {
      timeout = null;
      onSearchChange(value);
    }, delayMs);
  };

  dispatch.cancel = () => {
    if (!timeout) return;
    cancelTimeout(timeout);
    timeout = null;
  };

  return dispatch;
}

export const HISTORY_CEILING_FILTERS: Array<{
  label: string;
  value: HistoryCeilingFilter;
  tone: "gain" | "owl" | "loss" | null;
}> = [
  { label: "All", value: null, tone: null },
  { label: "<=55", value: 55, tone: "gain" },
  { label: "<=60", value: 60, tone: "owl" },
  { label: ">60", value: 999, tone: "loss" },
];

export function parseHistoryCeilingFilter(value: string | null): HistoryCeilingFilter {
  if (value === "55") return 55;
  if (value === "60") return 60;
  if (value === "999") return 999;
  return null;
}

export function historyCeilingParam(filter: HistoryCeilingFilter) {
  return filter === null ? "" : String(filter);
}

export function buildHistoryUrl({
  search,
  ceiling,
}: {
  search: string;
  ceiling: HistoryCeilingFilter;
}) {
  const params = new URLSearchParams();
  const trimmedSearch = search.trim();
  if (trimmedSearch) params.set("search", trimmedSearch);
  if (ceiling !== null) params.set("ceiling", historyCeilingParam(ceiling));
  const query = params.toString();
  return `/api/centering/history${query ? `?${query}` : ""}`;
}

export function faceWorstMax(face: PreGradeFace | null | undefined) {
  const value = face?.worstAxisMaxPct;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function sessionWorstMax(session: PreGradeSession) {
  const values = [faceWorstMax(session.front), faceWorstMax(session.back)].filter(
    (value): value is number => value !== null
  );
  if (values.length === 0) return null;
  return Math.max(...values);
}

export function sessionMatchesCeilingFilter(session: PreGradeSession, filter: HistoryCeilingFilter) {
  if (filter === null) return true;
  const worstMax = sessionWorstMax(session);
  if (worstMax === null) return false;
  if (filter === 55) return worstMax <= 55;
  if (filter === 60) return worstMax <= 60;
  return worstMax > 60;
}

export function filterPreGradeHistoryRows(rows: PreGradeSession[], filter: HistoryCeilingFilter) {
  return rows.filter((row) => sessionMatchesCeilingFilter(row, filter));
}

export function toneFromHistoryWorstMax(worstMax: number | null): "gain" | "owl" | "loss" {
  if (worstMax !== null && worstMax <= 55) return "gain";
  if (worstMax !== null && worstMax <= 60) return "owl";
  return "loss";
}

export function axisToneFromPcts(firstPct: number | null, secondPct: number | null) {
  if (firstPct === null || secondPct === null) return "loss";
  return toneFromHistoryWorstMax(Math.max(firstPct, secondPct));
}

export function ceilingDisplayLabel(ceiling: PsaCeiling) {
  if (ceiling === "PSA_10") return "10";
  if (ceiling === "PSA_9") return "9";
  if (ceiling === "PSA_8") return "8";
  if (ceiling === "PSA_7") return "7";
  return "<=6";
}

export function formatPct(value: number | null) {
  if (value === null) return "--";
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

export function formatRelativeTime(value: string | null, now = new Date()) {
  if (!value) return "unknown";
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return "unknown";

  const diffMs = now.getTime() - then.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export async function loadPreGradeHistory({
  search,
  ceiling,
  fetchImpl = fetch,
}: {
  search: string;
  ceiling: HistoryCeilingFilter;
  fetchImpl?: typeof fetch;
}) {
  const response = await fetchImpl(buildHistoryUrl({ search, ceiling }), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load pre-grade history (${response.status}).`);
  }

  const payload = (await response.json()) as { rows?: unknown; count?: unknown };
  const rows = Array.isArray(payload.rows) ? (payload.rows as PreGradeSession[]) : [];
  return {
    rows: filterPreGradeHistoryRows(rows, ceiling),
    count: typeof payload.count === "number" ? payload.count : rows.length,
  };
}

export async function renamePreGradeSession({
  id,
  newName,
  fetchImpl = fetch,
}: {
  id: string;
  newName: string;
  fetchImpl?: typeof fetch;
}) {
  const response = await fetchImpl(`/api/centering/session/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardIdentity: newName.trim() || null }),
  });

  if (!response.ok) {
    throw new Error(`Could not rename pre-grade (${response.status}).`);
  }

  return response.json() as Promise<{ session: PreGradeSession }>;
}

export async function deletePreGradeSession({
  id,
  fetchImpl = fetch,
}: {
  id: string;
  fetchImpl?: typeof fetch;
}) {
  const response = await fetchImpl(`/api/centering/session/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Could not delete pre-grade (${response.status}).`);
  }

  return response.json() as Promise<{ deleted: number; storageObjectsDeleted: number }>;
}
