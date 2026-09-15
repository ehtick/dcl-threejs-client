/**
 * scene.json display fields used by landing cards.
 *
 * Official docs: categories are stored in the root `tags` array as a closed slug
 * list; extra strings in that array are freeform tags.
 * @see https://docs.decentraland.org/creator/scenes-sdk7/kinds-of-projects/scene-metadata
 */

/** Predefined Places / scene.json category slugs (max 3 on a scene). */
export const SCENE_JSON_CATEGORY_SLUGS = [
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
] as const

const CATEGORY_SLUG_SET = new Set<string>(SCENE_JSON_CATEGORY_SLUGS)

export function uniqueDisplayLabels(values: Iterable<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const v = raw.trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

export function stringListFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim())
  }
  return out
}

function categoryKey(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, '-')
}

export function splitSceneTagsAndCategories(values: Iterable<string>): {
  tags: string[]
  categories: string[]
} {
  const tags: string[] = []
  const categories: string[] = []
  for (const item of uniqueDisplayLabels(values)) {
    if (CATEGORY_SLUG_SET.has(categoryKey(item))) categories.push(item)
    else tags.push(item)
  }
  return { tags, categories }
}

/** Root `tags` + optional `categories` from deployed scene.json metadata. */
export function tagsAndCategoriesFromSceneMetadata(
  metadata: Record<string, unknown> | undefined
): { tags: string[]; categories: string[] } {
  if (!metadata) return { tags: [], categories: [] }
  return splitSceneTagsAndCategories([
    ...stringListFromUnknown(metadata.categories),
    ...stringListFromUnknown(metadata.tags)
  ])
}

export function descriptionFromSceneMetadata(
  metadata: Record<string, unknown> | undefined
): string {
  if (!metadata) return ''
  const display = metadata.display
  if (display && typeof display === 'object') {
    const d = (display as Record<string, unknown>).description
    if (typeof d === 'string' && d.trim()) return d.trim()
  }
  const desc = metadata.description
  if (typeof desc === 'string' && desc.trim()) return desc.trim()
  return ''
}

/**
 * Catalyst / worlds-content-server entity `timestamp` (ms, or seconds if small).
 * ISO strings also accepted.
 */
export function deployedAtMsFromEntity(entity: Record<string, unknown>): number | null {
  return parseTimestampUnknown(entity.timestamp) ?? parseTimestampUnknown(entity.updatedAt)
}

export function parseIsoToMs(value: string | null | undefined): number | null {
  if (!value?.trim()) return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}

function parseTimestampUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) {
      return n < 1e12 ? Math.round(n * 1000) : Math.round(n)
    }
    return parseIsoToMs(value)
  }
  return null
}

export function formatLandingUpdatedAt(
  ms: number,
  nowMs: number = Date.now()
): { label: string; title: string } {
  const elapsed = Math.max(0, nowMs - ms)
  const days = Math.floor(elapsed / 86_400_000)
  const label = days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`
  const title = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(ms))
  return { label, title }
}
