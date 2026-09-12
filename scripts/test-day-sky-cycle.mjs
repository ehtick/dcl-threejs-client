#!/usr/bin/env node
/**
 * genesis-lab HDRI sky — 24h keyframe wrap + noon/night picks.
 * Run: npm run test:day-sky
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(process.cwd(), 'src/environment/daySkyCycle.ts'), 'utf8')

let failed = 0
function assert(label, cond) {
  if (cond) console.log(`  ok ${label}`)
  else {
    failed++
    console.error(` FAIL ${label}`)
  }
}

assert('cycle starts at midnight t=0', /t: hour\(0\)/.test(src))
assert('cycle ends at t=24 (wrap)', /t: hour\(24\)/.test(src))
assert('sunrise 6:15 key', /t: hour\(6\.25\)/.test(src))
assert('sunset ~19:50 key', /t: hour\(19\.8333\)/.test(src))
assert('noon uses qwantani', /t: hour\(12\), url: DAY_SKY_HDR\.qwantani/.test(src))
assert('afternoon uses kloppenheim (hunt clarity)', /t: hour\(15\), url: DAY_SKY_HDR\.kloppenheim/.test(src))
assert('golden hour uses syferfontein', /t: hour\(17\.5\), url: DAY_SKY_HDR\.syferfontein/.test(src))
assert('midnight is full night', /t: hour\(0\), url: DAY_SKY_HDR\.kloppenheim, gain: 0\.06, night: 1/.test(src))
assert('wrap key matches midnight', /t: hour\(24\), url: DAY_SKY_HDR\.kloppenheim, gain: 0\.06, night: 1/.test(src))
assert('noon is photographed day (night: 0)', /t: hour\(12\), url: DAY_SKY_HDR\.qwantani, gain: 1, night: 0/.test(src))
assert('four unique HDRIs referenced', src.includes('kloppenheim_06_puresky_2k.hdr') && src.includes('kloofendal_48d_partly_cloudy_puresky_2k.hdr') && src.includes('qwantani_noon_puresky_2k.hdr') && src.includes('syferfontein_1d_clear_puresky_2k.hdr'))

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nok day-sky-cycle')
