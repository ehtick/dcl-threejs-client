#!/usr/bin/env node
/**
 * UiText dirty key — full-string hash, not a prefix slice.
 * Countdown suffixes past 32 chars must change the fingerprint.
 *
 * Run: node scripts/test-ui-text-fingerprint.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(process.cwd(), 'src/ui/scene/uiTextFingerprint.ts'), 'utf8')
const scheduler = readFileSync(join(process.cwd(), 'src/shim/worker/sceneEngineUiScheduler.ts'), 'utf8')
const layout = readFileSync(join(process.cwd(), 'src/ui/scene/uiLayoutCache.ts'), 'utf8')

let failed = 0
function assert(label, cond) {
  if (cond) console.log(`  ok ${label}`)
  else {
    failed++
    console.error(` FAIL ${label}`)
  }
}

function fnv1aHex(value) {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function uiTextContentKey(value) {
  return `${value.length}:${fnv1aHex(value)}`
}

assert('src exports uiTextContentKey', src.includes('export function uiTextContentKey'))
assert('src does not prefix-slice value', !src.includes('value.slice('))
assert('scheduler uses uiTextContentKey', scheduler.includes('uiTextContentKey(value)'))
assert('scheduler does not slice UiText to 32', !scheduler.includes('value.slice(0, 32)'))
assert('layout paint key uses uiTextContentKey', layout.includes('uiTextContentKey(text.value)'))
assert('layout does not slice UiText to 48', !layout.includes('text.value.slice(0, 48)'))

const a = 'NEXT DROP PARTY: Drop Party Castle 01:00:00'
const b = 'NEXT DROP PARTY: Drop Party Castle 00:59:59'
assert('countdown strings share a 32-char prefix', a.slice(0, 32) === b.slice(0, 32))
assert('countdown strings share length', a.length === b.length)
assert('prefix+length fingerprint would freeze', `${a.length}:${a.slice(0, 32)}` === `${b.length}:${b.slice(0, 32)}`)
assert('full-string key changes every second', uiTextContentKey(a) !== uiTextContentKey(b))
assert('key is colon-safe hex', /^[0-9]+:[0-9a-f]{8}$/.test(uiTextContentKey(a)))

const mmssA = '12:34'
const mmssB = '12:33'
assert('short mm:ss timers still differ', uiTextContentKey(mmssA) !== uiTextContentKey(mmssB))

assert(
  'text-only strip regex matches :txLEN:hex',
  /:tx\d+:[0-9a-f]*/.test(`:tx${uiTextContentKey(a)}`) &&
    scheduler.includes('line.replace(/:tx\\d+:[0-9a-f]*/g, \'\')')
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nui-text-fingerprint ok')
