export const CUSTOMER_ORDER_ID_START = 100001;
export const CUSTOMER_ORDER_ID_MAX = 999999;

const SHORT_CUSTOMER_ORDER_ID_PATTERN = /^\d{5,6}$/;
const LEGACY_CUSTOMER_ORDER_ID_PATTERN = /^OM-\d{8}-(\d{1,6})$/i;

export function isShortCustomerOrderId(orderId: string) {
  return SHORT_CUSTOMER_ORDER_ID_PATTERN.test(orderId);
}

export function displayCustomerOrderNumber(orderId?: string | null) {
  const normalized = orderId?.trim();
  if (!normalized) return "Pending";

  if (isShortCustomerOrderId(normalized)) {
    return normalized;
  }

  const legacyMatch = normalized.match(LEGACY_CUSTOMER_ORDER_ID_PATTERN);
  if (legacyMatch) {
    const legacySequence = Number(legacyMatch[1]);
    if (Number.isFinite(legacySequence) && legacySequence > 0) {
      return String(CUSTOMER_ORDER_ID_START + legacySequence - 1);
    }
  }

  return normalized.replace(/^OM-/i, "");
}
