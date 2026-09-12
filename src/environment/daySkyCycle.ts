/**
 * Time-of-day crossfade of genesis-lab Poly Haven puresky HDRIs.
 *
 * Maps are CC0 (not Hyperland's files). Keys cover a full 24h so the
 * photographed dome tracks SkyboxTime instead of a single locked preset.
 */

import { ENVIRONMENT_SKY_BASE } from './environmentAssets'

export const DAY_SKY_HDR = {
  /** Afternoon blue, scattered fair-weather cloud (Hunt Clarity). */
  kloppenheim: `${ENVIRONMENT_SKY_BASE}kloppenheim_06_puresky_2k.hdr`,
  /** Cooler vault, more cloud along the rim (Reaping Silver). */
  kloofendal: `${ENVIRONMENT_SKY_BASE}kloofendal_48d_partly_cloudy_puresky_2k.hdr`,
  /** High noon, almost empty (Volt Meridian). */
  qwantani: `${ENVIRONMENT_SKY_BASE}qwantani_noon_puresky_2k.hdr`,
  /** Warm clear afternoon / golden hour (Ash Veil). */
  syferfontein: `${ENVIRONMENT_SKY_BASE}syferfontein_1d_clear_puresky_2k.hdr`
} as const

export type DaySkyHdrUrl = (typeof DAY_SKY_HDR)[keyof typeof DAY_SKY_HDR]

export type DaySkyCycleKey = {
  /** Normalized day time 0–1 (midnight → midnight). */
  t: number
  url: DaySkyHdrUrl
  /** Linear HDRI gain (1 = authored). Night keys drop this so stars read. */
  gain: number
  /** 0 day photographed sky, 1 full night (stars + moon, HDRI crushed). */
  night: number
  /** Baked sun azimuth in the HDRI (radians, Three spherical theta). */
  sunAzimuth: number
}

const DEG = Math.PI / 180
/** genesis-lab Hunt / Reaping / Volt sun. */
const AZ_ISLAND = -128 * DEG
/** genesis-lab Ash Veil sun. */
const AZ_ASH = -110 * DEG

function hour(h: number): number {
  return h / 24
}

/**
 * 24h keyframes. t=0 and t=1 are the same midnight look so wrap lerps cleanly.
 * Sunrise 6:15 / sunset 19:50 match `skyboxTime` SUNRISE / SUNSET.
 */
export const DAY_SKY_CYCLE: readonly DaySkyCycleKey[] = [
  { t: hour(0), url: DAY_SKY_HDR.kloppenheim, gain: 0.06, night: 1, sunAzimuth: AZ_ISLAND },
  { t: hour(5), url: DAY_SKY_HDR.syferfontein, gain: 0.14, night: 0.88, sunAzimuth: AZ_ASH },
  { t: hour(6.25), url: DAY_SKY_HDR.syferfontein, gain: 0.55, night: 0.38, sunAzimuth: AZ_ASH },
  { t: hour(7.5), url: DAY_SKY_HDR.kloofendal, gain: 0.92, night: 0.06, sunAzimuth: AZ_ISLAND },
  { t: hour(10), url: DAY_SKY_HDR.qwantani, gain: 1, night: 0, sunAzimuth: AZ_ISLAND },
  { t: hour(12), url: DAY_SKY_HDR.qwantani, gain: 1, night: 0, sunAzimuth: AZ_ISLAND },
  { t: hour(15), url: DAY_SKY_HDR.kloppenheim, gain: 1.05, night: 0, sunAzimuth: AZ_ISLAND },
  { t: hour(17.5), url: DAY_SKY_HDR.syferfontein, gain: 0.95, night: 0.08, sunAzimuth: AZ_ASH },
  { t: hour(19.8333), url: DAY_SKY_HDR.syferfontein, gain: 0.32, night: 0.58, sunAzimuth: AZ_ASH },
  { t: hour(21), url: DAY_SKY_HDR.kloppenheim, gain: 0.1, night: 0.95, sunAzimuth: AZ_ISLAND },
  { t: hour(24), url: DAY_SKY_HDR.kloppenheim, gain: 0.06, night: 1, sunAzimuth: AZ_ISLAND }
]

export type DaySkyCycleSample = {
  urlA: DaySkyHdrUrl
  urlB: DaySkyHdrUrl
  mix: number
  gain: number
  night: number
  sunAzimuthA: number
  sunAzimuthB: number
}

function wrap01(t: number): number {
  const x = t % 1
  return x < 0 ? x + 1 : x
}

export function sampleDaySkyCycle(normalizedT: number): DaySkyCycleSample {
  const t = wrap01(normalizedT)
  const keys = DAY_SKY_CYCLE
  let i = 0
  for (; i < keys.length - 1; i++) {
    if (t <= keys[i + 1]!.t) break
  }
  const a = keys[i]!
  const b = keys[i + 1] ?? keys[0]!
  const span = b.t - a.t
  const mix = span <= 1e-8 ? 0 : (t - a.t) / span
  return {
    urlA: a.url,
    urlB: b.url,
    mix,
    gain: a.gain + (b.gain - a.gain) * mix,
    night: a.night + (b.night - a.night) * mix,
    sunAzimuthA: a.sunAzimuth,
    sunAzimuthB: b.sunAzimuth
  }
}

export function uniqueDaySkyHdrUrls(): DaySkyHdrUrl[] {
  return [...new Set(DAY_SKY_CYCLE.map((k) => k.url))]
}
