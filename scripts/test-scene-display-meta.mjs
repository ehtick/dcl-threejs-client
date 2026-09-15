#!/usr/bin/env node
/**
 * scene.json tags/categories + entity deploy timestamp parsing.
 * Run: node scripts/test-scene-display-meta.mjs
 */
const CATEGORY_SLUGS = new Set([
  'art',
  'game',
  'casino',
  'social',
  'music',
  'fashion',
  'crypto',
  'education',
  'shop',
  'business',
  'sports',
  'parkour'
])

function uniqueDisplayLabels(values) {
  const out = []
  const seen = new Set()
  for (const raw of values) {
    const v = String(raw ?? '').trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

function splitSceneTagsAndCategories(values) {
  const tags = []
  const categories = []
  for (const item of uniqueDisplayLabels(values)) {
    const key = item.trim().toLowerCase().replace(/_/g, '-')
    if (CATEGORY_SLUGS.has(key)) categories.push(item)
    else tags.push(item)
  }
  return { tags, categories }
}

function tagsAndCategoriesFromSceneMetadata(metadata) {
  if (!metadata) return { tags: [], categories: [] }
  const list = []
  for (const key of ['categories', 'tags']) {
    const raw = metadata[key]
    if (!Array.isArray(raw)) continue
    for (const item of raw) {
      if (typeof item === 'string' && item.trim()) list.push(item.trim())
    }
  }
  return splitSceneTagsAndCategories(list)
}

function deployedAtMsFromEntity(entity) {
  const value = entity.timestamp ?? entity.updatedAt
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return n < 1e12 ? Math.round(n * 1000) : Math.round(n)
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

let failed = 0
function assert(label, cond) {
  if (cond) console.log(`  ok ${label}`)
  else {
    failed++
    console.error(` FAIL ${label}`)
  }
}

const fromJson = tagsAndCategoriesFromSceneMetadata({
  tags: ['game', 'casino', 'sync', 'conformance', 'game'],
  categories: ['social']
})
assert('splits category slugs from tags', fromJson.categories.join(',') === 'social,game,casino')
assert('keeps freeform tags', fromJson.tags.join(',') === 'sync,conformance')

const empty = tagsAndCategoriesFromSceneMetadata({ tags: [] })
assert('empty tags', empty.tags.length === 0 && empty.categories.length === 0)

assert('ms timestamp', deployedAtMsFromEntity({ timestamp: 1710000000000 }) === 1710000000000)
assert('seconds timestamp', deployedAtMsFromEntity({ timestamp: 1710000000 }) === 1710000000000)
assert('iso timestamp', deployedAtMsFromEntity({ timestamp: '2024-03-09T12:00:00.000Z' }) === Date.parse('2024-03-09T12:00:00.000Z'))
assert('missing timestamp', deployedAtMsFromEntity({}) === null)

function formatLandingUpdatedAt(ms, nowMs) {
  const elapsed = Math.max(0, nowMs - ms)
  const days = Math.floor(elapsed / 86_400_000)
  return days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`
}
const now = Date.parse('2026-09-14T12:00:00.000Z')
assert('updated today', formatLandingUpdatedAt(now - 3_600_000, now) === 'today')
assert('updated 1 day ago', formatLandingUpdatedAt(now - 86_400_000, now) === '1 day ago')
assert('updated 12 days ago', formatLandingUpdatedAt(now - 12 * 86_400_000, now) === '12 days ago')

if (failed) {
  console.error(`failed: ${failed}`)
  process.exit(1)
}
console.log('ok scene display meta')
