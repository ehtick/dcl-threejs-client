import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { ENVIRONMENT_TEXTURES } from './environmentAssets'
import { clampTextureSize } from '../rendering/clampTextureSize'
import { sampleSkyGradients } from './skyGradients'
import { normalizedTimeOfDay } from './skyboxTime'
import { isSunPeriod } from './sunCycleSampler'
import { sampleDaySkyCycle, uniqueDaySkyHdrUrls } from './daySkyCycle'
import {
  FIXED_SUN_DISC_CORE_GAIN,
  FIXED_SUN_DISC_CUTOFF,
  FIXED_SUN_DISC_GLOW_GAIN
} from '../rendering/SunEnvironmentSettings'

/**
 * Photographed HDRI skydome — genesis-lab DaySky architecture (Hyperfy/Hyperland):
 * BackSide sphere, equirect map, fog off, camera-follow. Not a procedural blob.
 *
 * Maps are CC0 Poly Haven puresky HDRIs. Time of day crossfades adjacent maps
 * and fades in stars/moon overnight so SkyboxTime still drives the cycle.
 */

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const SKY_FRAGMENT = /* glsl */ `
uniform sampler2D uMapA;
uniform sampler2D uMapB;
uniform float uMix;
uniform float uGain;
uniform float uNight;
uniform float uRotationA;
uniform float uRotationB;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform vec3 uMoonDirection;
uniform float uMoonMask;
uniform float uSunRadiance;
uniform float uSunDiscCutoff;
uniform float uSunDiscCoreGain;
uniform float uSunDiscGlowGain;
uniform sampler2D uMoonMap;
uniform sampler2D uStarsMap;

varying vec3 vDir;

vec3 rotateY(vec3 dir, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(c * dir.x + s * dir.z, dir.y, -s * dir.x + c * dir.z);
}

vec2 equirect(vec3 dir) {
  return vec2(
    atan(dir.x, dir.z) * 0.15915494309 + 0.5,
    asin(clamp(dir.y, -1.0, 1.0)) * 0.31830988618 + 0.5
  );
}

vec3 sampleHdr(sampler2D map, vec3 dir, float rot) {
  vec3 d = rotateY(normalize(dir), rot);
  return texture2D(map, equirect(d)).rgb;
}

vec2 skyboxUv(vec3 dir) {
  return vec2(
    atan(dir.x, dir.z) * 0.15915494309 + 0.5,
    asin(clamp(dir.y, -1.0, 1.0)) * 0.31830988618 + 0.5
  );
}

vec3 starField(vec3 dir, sampler2D map, float night) {
  if (night <= 0.01) return vec3(0.0);
  vec2 uv = skyboxUv(dir) * vec2(8.0, 3.0);
  float pole = abs(dir.y);
  float lodBias = pole * pole * pole * pole * 12.0;
  vec3 stars = texture2D(map, uv, lodBias).rgb;
  float aboveHorizon = smoothstep(-0.05, 0.15, dir.y);
  return stars * night * aboveHorizon * (1.0 - smoothstep(0.92, 0.998, pole)) * 2.5;
}

vec3 moonDisc(vec3 dir, vec3 moonDir, sampler2D map, float mask) {
  if (mask < 0.001) return vec3(0.0);
  vec3 m = normalize(moonDir);
  if (m.y < -0.08) return vec3(0.0);
  vec3 v = normalize(dir);
  float moonDot = dot(v, m);
  float moonSize = 0.018;
  float disc = step(cos(moonSize), moonDot);
  vec3 up = abs(m.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tang = normalize(cross(up, m));
  vec3 bitang = cross(m, tang);
  vec3 biteDir = normalize(m + (tang * 0.42 + bitang * (-0.18)) * moonSize * 12.0);
  float bite = step(cos(moonSize * 0.92), dot(v, biteDir));
  float crescent = disc * (1.0 - bite);
  vec3 companionDir = normalize(m + tang * 0.032 + bitang * 0.028);
  float companion = step(cos(moonSize * 0.18), dot(v, companionDir));
  float softCore = pow(max(moonDot, 0.0), 220.0) * 0.35;
  float softHalo = pow(max(moonDot, 0.0), 90.0) * 0.12;
  vec2 uv = vec2(dot(v, tang), dot(v, bitang)) / max(sin(moonSize * 1.4), 1e-4) * 0.5 + 0.5;
  vec2 q = uv * 2.0 - 1.0;
  float inCircle = 1.0 - smoothstep(0.82, 0.98, length(q));
  vec4 tex = texture2D(map, clamp(uv, 0.0, 1.0));
  float texAmt = inCircle * clamp(max(tex.a, max(tex.r, max(tex.g, tex.b))), 0.0, 1.0) * 0.35;
  vec3 surface = mix(vec3(1.9, 1.95, 2.15), tex.rgb * 1.6, texAmt);
  float opacity = clamp(mask * 6.25, 0.0, 1.0);
  return surface * (crescent * 2.4 + companion * 1.6 + softCore + softHalo) * opacity;
}

vec3 sunDisc(vec3 dir, vec3 sunDir, vec3 sunColor, float radiance) {
  if (radiance <= 0.001) return vec3(0.0);
  vec3 sDir = normalize(sunDir);
  float d = dot(normalize(dir), sDir);
  float glowAmt = max(uSunDiscGlowGain, 0.0);
  float glowReach = uSunDiscCutoff - mix(0.004, 0.022, glowAmt);
  if (d < glowReach) return vec3(0.0);
  float ang = acos(clamp(d, -1.0, 1.0));
  float coreEdge = acos(clamp(uSunDiscCutoff, -1.0, 1.0));
  float core = 1.0 - smoothstep(0.0, max(coreEdge * 0.95, 0.0008), ang);
  core = pow(max(core, 0.0), 1.3);
  float rPos = max(radiance, 0.0);
  float innerSpread = mix(0.005, 0.028, glowAmt);
  float outerSpread = max(innerSpread * 3.2, 0.012);
  float corona = exp(-ang / innerSpread) * glowAmt * (1.1 + rPos * 0.6);
  float bloom = exp(-ang / outerSpread) * glowAmt * (0.4 + rPos * 0.25);
  vec3 warm = sunColor * vec3(1.28, 1.08, 0.86);
  float rad = 0.5 + rPos * 0.55;
  return warm * rad * (core * uSunDiscCoreGain + corona + bloom);
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 hdr = mix(sampleHdr(uMapA, dir, uRotationA), sampleHdr(uMapB, dir, uRotationB), clamp(uMix, 0.0, 1.0));
  vec3 sky = hdr * max(uGain, 0.0);
  vec3 nightCol = vec3(0.018, 0.022, 0.055);
  sky = mix(sky, nightCol, clamp(uNight, 0.0, 1.0) * 0.88);
  sky += starField(dir, uStarsMap, uNight);
  sky += sunDisc(dir, uSunDirection, uSunColor, uSunRadiance);
  sky += moonDisc(dir, uMoonDirection, uMoonMap, uMoonMask);
  gl_FragColor = vec4(sky, 1.0);
}
`

export type DaySkyUniforms = {
  uMapA: THREE.IUniform<THREE.Texture | null>
  uMapB: THREE.IUniform<THREE.Texture | null>
  uMix: THREE.IUniform<number>
  uGain: THREE.IUniform<number>
  uNight: THREE.IUniform<number>
  uRotationA: THREE.IUniform<number>
  uRotationB: THREE.IUniform<number>
  uSunColor: THREE.IUniform<THREE.Color>
  uSunDirection: THREE.IUniform<THREE.Vector3>
  uMoonDirection: THREE.IUniform<THREE.Vector3>
  uMoonMask: THREE.IUniform<number>
  uSunRadiance: THREE.IUniform<number>
  uSunDiscCutoff: THREE.IUniform<number>
  uSunDiscCoreGain: THREE.IUniform<number>
  uSunDiscGlowGain: THREE.IUniform<number>
  uMoonMap: THREE.IUniform<THREE.Texture | null>
  uStarsMap: THREE.IUniform<THREE.Texture | null>
}

const _zeroSun = new THREE.Vector3(0, -1, 0)
const _warmHorizon = new THREE.Color(1, 0.82, 0.58)
const hdrLoader = new RGBELoader()
const hdrCache = new Map<string, Promise<THREE.DataTexture>>()

function loadHdr(url: string): Promise<THREE.DataTexture> {
  let pending = hdrCache.get(url)
  if (pending) return pending
  pending = new Promise((resolve, reject) => {
    hdrLoader.load(
      url,
      (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping
        tex.colorSpace = THREE.LinearSRGBColorSpace
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.needsUpdate = true
        resolve(tex)
      },
      undefined,
      reject
    )
  })
  hdrCache.set(url, pending)
  return pending
}

function azimuthOf(dir: THREE.Vector3): number {
  return Math.atan2(dir.x, dir.z)
}

/** genesis-lab photographed HDRI dome, driven by SkyboxTime. */
export class DaySky {
  readonly mesh: THREE.Mesh
  readonly material: THREE.ShaderMaterial
  readonly uniforms: DaySkyUniforms
  private readonly maps = new Map<string, THREE.DataTexture>()
  private moonTex: THREE.Texture | null = null
  private starsTex: THREE.Texture | null = null

  constructor() {
    this.uniforms = {
      uMapA: { value: null },
      uMapB: { value: null },
      uMix: { value: 0 },
      uGain: { value: 1 },
      uNight: { value: 0 },
      uRotationA: { value: 0 },
      uRotationB: { value: 0 },
      uSunColor: { value: new THREE.Color(1, 0.96, 0.9) },
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDirection: { value: new THREE.Vector3(0, -1, 0) },
      uMoonMask: { value: 0 },
      uSunRadiance: { value: 0 },
      uSunDiscCutoff: { value: FIXED_SUN_DISC_CUTOFF },
      uSunDiscCoreGain: { value: FIXED_SUN_DISC_CORE_GAIN },
      uSunDiscGlowGain: { value: FIXED_SUN_DISC_GLOW_GAIN },
      uMoonMap: { value: null },
      uStarsMap: { value: null }
    }

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: true
    })

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), this.material)
    this.mesh.name = 'DaySky'
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1000
    this.mesh.matrixAutoUpdate = true
    this.mesh.scale.setScalar(520)
    this.mesh.userData.dclBloomExclude = true
  }

  async loadTextures(): Promise<void> {
    const loader = new THREE.TextureLoader()
    const [moon, stars] = await Promise.all([
      loader.loadAsync(ENVIRONMENT_TEXTURES.moon).then((tex) => {
        clampTextureSize(tex)
        return tex
      }),
      loader.loadAsync(ENVIRONMENT_TEXTURES.stars).then((tex) => {
        clampTextureSize(tex)
        return tex
      }),
      ...uniqueDaySkyHdrUrls().map((url) =>
        loadHdr(url).then((tex) => {
          this.maps.set(url, tex)
          return tex
        })
      )
    ])

    moon.colorSpace = THREE.SRGBColorSpace
    moon.wrapS = THREE.ClampToEdgeWrapping
    moon.wrapT = THREE.ClampToEdgeWrapping
    stars.colorSpace = THREE.SRGBColorSpace
    stars.wrapS = THREE.RepeatWrapping
    stars.wrapT = THREE.RepeatWrapping

    this.moonTex = moon
    this.starsTex = stars
    this.uniforms.uMoonMap.value = moon
    this.uniforms.uStarsMap.value = stars

    const first = this.maps.get(uniqueDaySkyHdrUrls()[0]!)
    if (first) {
      this.uniforms.uMapA.value = first
      this.uniforms.uMapB.value = first
    }
  }

  update(
    seconds: number,
    celestialDir: THREE.Vector3,
    _delta: number,
    _freezeClouds = false
  ): void {
    const sample = sampleDaySkyCycle(normalizedTimeOfDay(seconds))
    const day = isSunPeriod(seconds)
    const g = sampleSkyGradients(normalizedTimeOfDay(seconds))
    const elev = THREE.MathUtils.clamp(celestialDir.y, -1, 1)
    const mapA = this.maps.get(sample.urlA) ?? this.uniforms.uMapA.value
    const mapB = this.maps.get(sample.urlB) ?? mapA
    this.uniforms.uMapA.value = mapA
    this.uniforms.uMapB.value = mapB
    this.uniforms.uMix.value = sample.mix
    this.uniforms.uGain.value = sample.gain
    this.uniforms.uNight.value = sample.night

    const sunAz = azimuthOf(celestialDir)
    this.uniforms.uRotationA.value = sunAz - sample.sunAzimuthA
    this.uniforms.uRotationB.value = sunAz - sample.sunAzimuthB

    // LDR warm disc — HDR gradient sun keys are authored for the old un-tonemapped shader.
    const sunElev = Math.max(0, elev)
    this.uniforms.uSunColor.value.setRGB(1, 0.96, 0.9).lerp(_warmHorizon, 1 - sunElev)
    this.uniforms.uSunDirection.value.copy(day ? celestialDir : _zeroSun)
    this.uniforms.uMoonDirection.value.copy(day ? _zeroSun : celestialDir)
    this.uniforms.uMoonMask.value = day ? 0 : Math.max(g.moonMask, 0.16)

    // Photographed HDRI already has a high-sun disc. Draw ours only near the
    // horizon so dawn/dusk match SkyboxTime instead of showing two suns.
    const lowSun = day ? 1 - THREE.MathUtils.smoothstep(0.08, 0.32, elev) : 0
    this.uniforms.uSunRadiance.value = day
      ? lowSun * Math.max(0.2, (1 - sample.night) * 0.85)
      : 0
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.moonTex?.dispose()
    this.starsTex?.dispose()
    this.moonTex = null
    this.starsTex = null
    this.uniforms.uMoonMap.value = null
    this.uniforms.uStarsMap.value = null
    this.uniforms.uMapA.value = null
    this.uniforms.uMapB.value = null
    // HDRIs stay in the module cache — scenes remount often; reload is expensive.
  }
}
