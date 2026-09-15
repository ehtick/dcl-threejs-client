#!/usr/bin/env node
/**
 * Explorer FlatFetchResponse: ok is derived from HTTP status.
 * Missing ok + HTTP 200 must not look like failure (Drop Party admission).
 *
 * Run: node scripts/test-signed-fetch-response.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
function assert(label, cond) {
  if (cond) console.log(`  ok ${label}`)
  else {
    failed++
    console.error(` FAIL ${label}`)
  }
}

function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1)
  if (text.startsWith('\u00ef\u00bb\u00bf')) return text.slice(3)
  return text
}

function firstJsonObject(text) {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
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

function asJsonBodyString(body) {
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
    if (token) return JSON.stringify({ token: token[1].replace(/\\"/g, '"') })
    return text
  }
}

function normalizeFlatFetchResponse(raw) {
  const status = Number(raw.status ?? raw.statusCode ?? 0)
  const ok = Number.isFinite(status) && status >= 200 && status < 300
  return {
    ok,
    status: Number.isFinite(status) ? status : 0,
    statusText: raw.statusText ?? '',
    body: asJsonBodyString(raw.body),
    headers: raw.headers ?? {}
  }
}

const tokenJson = '{"token":"7b2276657273696f6e223a31"}'
const missingOk = normalizeFlatFetchResponse({ status: 200, body: tokenJson })
assert('HTTP 200 without ok is success', missingOk.ok === true)
assert('status stays 200', missingOk.status === 200)
assert('body parses', JSON.parse(missingOk.body).token.startsWith('7b22'))

const parsedBody = normalizeFlatFetchResponse({ status: 200, body: { token: 'abc' } })
assert('object body is stringified', typeof parsedBody.body === 'string')
assert('object body parses', JSON.parse(parsedBody.body).token === 'abc')

const bom = normalizeFlatFetchResponse({ status: 200, body: `\ufeff${tokenJson}` })
assert('BOM stripped', bom.body.startsWith('{'))
assert('BOM body parses', JSON.parse(bom.body).token)

const aliased = normalizeFlatFetchResponse({ statusCode: 200, body: tokenJson })
assert('statusCode alias is 200 ok', aliased.ok === true && aliased.status === 200)

const fail = normalizeFlatFetchResponse({ ok: true, status: 401, body: '{"error":"no"}' })
assert('HTTP 401 is not ok even if ok:true was passed', fail.ok === false)

function sceneQc(r) {
  const i = JSON.parse(r.body || '{}')
  if (!r.ok) {
    const c = typeof i.error === 'string' ? i.error.trim() : ''
    throw new Error(c.length > 0 ? c : `Request failed (${r.status})`)
  }
  return i
}

const admitted = sceneQc(missingOk)
assert('scene Qc accepts normalized 200', admitted.token.startsWith('7b22'))

let threw = false
try {
  sceneQc({ status: 200, body: tokenJson })
} catch (e) {
  threw = e instanceof Error && e.message === 'Request failed (200)'
}
assert('scene Qc rejects missing ok as Request failed (200)', threw)

const trailing = normalizeFlatFetchResponse({
  status: 200,
  body: tokenJson + '\n{"ignored":true}'
})
assert('trailing JSON garbage is stripped', JSON.parse(trailing.body).token.startsWith('7b22'))
assert('trailing does not keep second object', JSON.parse(trailing.body).ignored === undefined)

const src = readFileSync(join(process.cwd(), 'src/shim/signedFetchResponse.ts'), 'utf8')
assert('helper derives ok from status', src.includes('status >= 200 && status < 300'))

const proxy = readFileSync(join(process.cwd(), 'scripts/scene-fetch-proxy.mjs'), 'utf8')
assert(
  'scene-http proxy does not forward compressed Content-Length',
  proxy.includes("lower === 'content-encoding' || lower === 'content-length'")
)
assert(
  'scene-http proxy sets Content-Length from decompressed buf',
  proxy.includes("res.setHeader('Content-Length', String(buf.length))")
)
assert(
  'scene-http proxy requests identity encoding',
  proxy.includes("headers['accept-encoding'] = 'identity'")
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nsigned-fetch-response ok')
