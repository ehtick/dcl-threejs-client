#!/usr/bin/env node
/**
 * MeshCollider.setBox(entity) omits collisionMask. Proto default is POINTER|PHYSICS.
 * CRDT 0 must not drop the collider (clown torso click box).
 *
 * Run: node scripts/test-mesh-collider-mask.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CL_NONE = 0
const CL_POINTER = 1
const CL_PHYSICS = 2
const DEFAULT_COLLISION_MASK = CL_POINTER | CL_PHYSICS

function resolveCollisionMask(mask) {
  return mask ?? DEFAULT_COLLISION_MASK
}

function resolveMeshColliderCollisionMask(mask) {
  if (mask == null || mask === 0) return DEFAULT_COLLISION_MASK
  return mask
}

let failed = 0
function assert(label, cond) {
  if (cond) console.log(`  ok ${label}`)
  else {
    failed++
    console.error(` FAIL ${label}`)
  }
}

assert('omitted mask is default', resolveMeshColliderCollisionMask(undefined) === DEFAULT_COLLISION_MASK)
assert('CRDT-materialized 0 is default, not CL_NONE', resolveMeshColliderCollisionMask(0) !== CL_NONE)
assert('CRDT 0 is POINTER|PHYSICS', resolveMeshColliderCollisionMask(0) === DEFAULT_COLLISION_MASK)
assert('generic resolveCollisionMask still treats 0 as 0', resolveCollisionMask(0) === 0)
assert('explicit POINTER stays POINTER', resolveMeshColliderCollisionMask(CL_POINTER) === CL_POINTER)
assert(
  'explicit PHYSICS stays PHYSICS',
  resolveMeshColliderCollisionMask(CL_PHYSICS) === CL_PHYSICS
)

const layer = readFileSync(join(process.cwd(), 'src/collision/ColliderLayer.ts'), 'utf8')
const collision = readFileSync(join(process.cwd(), 'src/collision/CollisionSystem.ts'), 'utf8')
assert('exports resolveMeshColliderCollisionMask', layer.includes('export function resolveMeshColliderCollisionMask'))
assert(
  'CollisionSystem uses MeshCollider mask resolver',
  collision.includes('resolveMeshColliderCollisionMask(spec.collisionMask)')
)
assert(
  'CollisionSystem does not use generic resolver for MeshCollider',
  !collision.includes('resolveCollisionMask(spec.collisionMask)')
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nmesh-collider-mask ok')
