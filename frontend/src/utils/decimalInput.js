/**
 * Amount, price and quantity fields are text fields with a decimal keyboard
 * instead of browser number fields: a number field silently drops a typed
 * comma, so "12,5" became 125. Fields marked with DECIMAL_INPUT_PROPS get
 * their comma turned into a dot (and spaces removed) as the user types.
 */
export const DECIMAL_INPUT_PROPS = Object.freeze({ inputMode: 'decimal', autoComplete: 'off', 'data-decimal': 'true' });

export function normalizeDecimalText(text) {
  return String(text ?? '').replace(/[\s  ]/g, '').replace(/,/g, '.');
}

/** Parse a typed amount ("12,5", "1 200.50") to a number, NaN when it is not one. */
export function parseDecimal(value) {
  if (typeof value === 'number') return value;
  const text = normalizeDecimalText(value);
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return Number.NaN;
  return Number(text);
}

const nativeValueSetter = typeof HTMLInputElement === 'undefined'
  ? null
  : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

function normalizeEvent(event) {
  const input = event.target;
  if (!nativeValueSetter || !(input instanceof HTMLInputElement) || !input.hasAttribute('data-decimal')) return;
  const raw = input.value;
  const next = normalizeDecimalText(raw);
  if (next === raw) return;
  const caret = input.selectionStart ?? raw.length;
  const nextCaret = normalizeDecimalText(raw.slice(0, caret)).length;
  // The native setter bypasses React's value tracker, so React still sees a
  // change and passes the normalized value to the field's onChange.
  nativeValueSetter.call(input, next);
  try { input.setSelectionRange(nextCaret, nextCaret); } catch { /* not focusable */ }
}

/** Install once at startup; runs before React's own input handling. */
export function installDecimalInputNormalizer(target = document) {
  target.addEventListener('input', normalizeEvent, true);
  return () => target.removeEventListener('input', normalizeEvent, true);
}
