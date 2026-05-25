export type JsonRecord = Record<string, unknown>;

export interface OnePieceCardPayloadFields {
  card_type: string | null;
  color: string[];
  power: number | null;
  counter: number | null;
  life: number | null;
  cost: number | null;
  attribute: string | null;
  types: string[] | null;
  effect: string | null;
  trigger: string | null;
  artist: string | null;
  printed_set_code: string | null;
  promo_segment: string | null;
  promo_source: string | null;
  is_stamped: boolean | null;
  is_serialized: boolean | null;
  serial_max: number | null;
  tournament_event: string | null;
  tournament_placement: string | null;
  tournament_season: string | null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string");
}

function prefer<T>(payloadValue: T | null, legacyValue: unknown, fallback: T): T {
  return payloadValue ?? ((legacyValue as T | null | undefined) ?? fallback);
}

function preferNullable<T>(payloadValue: T | null, legacyValue: unknown): T | null {
  return payloadValue ?? ((legacyValue as T | null | undefined) ?? null);
}

export function readOnePieceCardPayload(row: JsonRecord): OnePieceCardPayloadFields {
  const payload = asRecord(row.game_payload);
  const card = asRecord(payload.card);
  const print = asRecord(payload.print);
  const tournament = asRecord(print.tournament);

  return {
    card_type: preferNullable(asString(card.card_type), row.card_type),
    color: prefer(asStringArray(card.color), row.color, []),
    power: preferNullable(asNumber(card.power), row.power),
    counter: preferNullable(asNumber(card.counter), row.counter),
    life: preferNullable(asNumber(card.life), row.life),
    cost: preferNullable(asNumber(card.cost), row.cost),
    attribute: preferNullable(asString(card.attribute), row.attribute),
    types: preferNullable(asStringArray(card.types), row.types),
    effect: preferNullable(asString(card.effect), row.effect),
    trigger: preferNullable(asString(card.trigger), row.trigger),
    artist: preferNullable(asString(card.artist), row.artist),
    printed_set_code: preferNullable(asString(print.printed_set_code), row.printed_set_code),
    promo_segment: preferNullable(asString(print.promo_segment), row.promo_segment),
    promo_source: preferNullable(asString(print.promo_source), row.promo_source),
    is_stamped: preferNullable(asBoolean(print.is_stamped), row.is_stamped),
    is_serialized: preferNullable(asBoolean(print.is_serialized), row.is_serialized),
    serial_max: preferNullable(asNumber(print.serial_max), row.serial_max),
    tournament_event: preferNullable(asString(tournament.event), row.tournament_event),
    tournament_placement: preferNullable(asString(tournament.placement), row.tournament_placement),
    tournament_season: preferNullable(asString(tournament.season), row.tournament_season),
  };
}

export function withOnePiecePayloadFallbacks<T extends JsonRecord>(row: T): T {
  const fields = readOnePieceCardPayload(row);

  return {
    ...row,
    card_type: fields.card_type,
    color: fields.color,
    power: fields.power,
    counter: fields.counter,
    life: fields.life,
    cost: fields.cost,
    attribute: fields.attribute,
    types: fields.types,
    effect: fields.effect,
    trigger: fields.trigger,
    artist: fields.artist,
    printed_set_code: fields.printed_set_code,
    promo_segment: fields.promo_segment,
    promo_source: fields.promo_source,
    is_stamped: fields.is_stamped,
    is_serialized: fields.is_serialized,
    serial_max: fields.serial_max,
    tournament_event: fields.tournament_event,
    tournament_placement: fields.tournament_placement,
    tournament_season: fields.tournament_season,
  };
}

export function withOnePiecePayloadFallbacksList<T extends JsonRecord>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).map((row) => withOnePiecePayloadFallbacks(row));
}
