/**
 * Dirty key for `UiText.value`.
 *
 * Prefix-only dirty keys miss countdown suffixes: a line like
 * `NEXT DROP PARTY: Drop Party Castle 01:23:45` shares its first 32 chars with
 * every later second, so cooperative UI CRDT never PUTs and the HUD freezes.
 * Hash the full string (colon-safe) so any value change dirties the fingerprint.
 */
export function fnv1aHex(value: string): string {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** `length:hex` — no extra colons inside the hex so fingerprint field split stays stable. */
export function uiTextContentKey(value: string): string {
  return `${value.length}:${fnv1aHex(value)}`
}
