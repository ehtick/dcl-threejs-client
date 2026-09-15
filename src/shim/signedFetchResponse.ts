import type { SignedFetchResponse } from './types'

/**
 * Explorer kernel `FlatFetchResponse`: `ok` + `status` + string `body`.
 * Scenes (`if (!r.ok) throw Request failed (${r.status})`) treat missing `ok` as
 * failure even on HTTP 200. Always derive `ok` from status; body is a JSON string.
 */
function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1)
  if (text.startsWith('\u00ef\u00bb\u00bf')) return text.slice(3)
  return text
}

/** First `{...}` value — trailing garbage after a complete object must not fail scene JSON.parse. */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function asJsonBodyString(body: unknown): string {
  if (body == null) return ''
  if (typeof body !== 'string') {
    try {
      return JSON.stringify(body)
    } catch {
      return String(body)
    }
  }
  let text = stripBom(body).trim()
  try {
    return JSON.stringify(JSON.parse(text))
  } catch {
    const slice = firstJsonObject(text)
    if (slice) {
      try {
        return JSON.stringify(JSON.parse(slice))
      } catch {
        /* fall through */
      }
    }
    const token = text.match(/"token"\s*:\s*"((?:\\.|[^"\\])*)"/)
    if (token) return JSON.stringify({ token: token[1]!.replace(/\\"/g, '"') })
    return text
  }
}

export function normalizeFlatFetchResponse(
  raw: Partial<SignedFetchResponse> & { statusCode?: number; body?: unknown }
): SignedFetchResponse {
  const status = Number(raw.status ?? raw.statusCode ?? 0)
  const ok = Number.isFinite(status) && status >= 200 && status < 300
  const headers: Record<string, string> = {}
  if (raw.headers && typeof raw.headers === 'object') {
    for (const [key, value] of Object.entries(raw.headers)) {
      if (value == null) continue
      headers[key] = String(value)
    }
  }
  return {
    ok,
    status: Number.isFinite(status) ? status : 0,
    statusText: raw.statusText ?? '',
    body: asJsonBodyString(raw.body),
    headers
  }
}
