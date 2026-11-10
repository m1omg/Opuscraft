import * as THREE from 'three';
import type { BiomeId } from '../sim/map';

/** Shared uniforms injected into every world material (fog of war, time, wind). */
export const worldUniforms = {
  uFog: { value: null as THREE.Texture | null },
  uMapSize: { value: new THREE.Vector2(128, 128) },
  uTime: { value: 0 },
  uFogEnabled: { value: 1 },
};

/**
 * Patch a built-in material so it darkens with fog of war and (optionally) sways in the wind.
 * Unexplored = near black, explored but not visible = dim and desaturated.
 */
export function patchWorld(mat: THREE.Material, opts: { wind?: boolean; noFog?: boolean } = {}): THREE.Material {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFog = worldUniforms.uFog;
    shader.uniforms.uMapSize = worldUniforms.uMapSize;
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.uniforms.uFogEnabled = worldUniforms.uFogEnabled;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         varying vec3 vFogWP;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         ${
           opts.wind
             ? `{
                 vec4 wbase = vec4(0.0, 0.0, 0.0, 1.0);
                 #ifdef USE_INSTANCING
                   wbase = instanceMatrix * wbase;
                 #endif
                 float sway = max(0.0, transformed.y - 0.6) * 0.035;
                 transformed.x += sin(uTime * 1.3 + wbase.x * 0.7 + wbase.z * 0.3) * sway;
                 transformed.z += cos(uTime * 1.1 + wbase.z * 0.6) * sway * 0.6;
               }`
             : ''
         }`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         {
           vec4 fwp = vec4(transformed, 1.0);
           #ifdef USE_INSTANCING
             fwp = instanceMatrix * fwp;
           #endif
           vFogWP = (modelMatrix * fwp).xyz;
         }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D uFog;
         uniform vec2 uMapSize;
         uniform float uFogEnabled;
         varying vec3 vFogWP;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         ${
           opts.noFog
             ? ''
             : `if (uFogEnabled > 0.5) {
                 float fv = texture2D(uFog, vFogWP.xz / uMapSize).r;
                 float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
                 vec3 dim = mix(vec3(lum), gl_FragColor.rgb, 0.45) * 0.42;
                 vec3 col = fv < 0.5 ? mix(vec3(0.012, 0.014, 0.02), dim, fv * 2.0) : mix(dim, gl_FragColor.rgb, (fv - 0.5) * 2.0);
                 gl_FragColor.rgb = col;
               }`
         }`,
      );
  };
  // distinct program cache key per variant
  const key = 'world' + (opts.wind ? 'W' : '') + (opts.noFog ? 'N' : '');
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** Standard materials used by all procedural models. */
export const MATS = {
  solid: patchWorld(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })) as THREE.MeshLambertMaterial,
  glow: patchWorld(new THREE.MeshBasicMaterial({ vertexColors: true })) as THREE.MeshBasicMaterial,
  ghost: patchWorld(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.55, depthWrite: false })) as THREE.MeshLambertMaterial,
  foliage: patchWorld(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { wind: true }) as THREE.MeshLambertMaterial,
};

export interface BiomePalette {
  terrain: number[]; // indexed by Terrain enum
  blight: number;
  water: number;
  waterDeep: number;
  sky: number;
  skyNight: number;
  sun: number;
  ambient: number;
  ground: number;
  lava?: boolean;
  grassTuft: number;
  rock: number;
}

// Terrain order: Grass, Dirt, Rock, Sand, Snow, Road, Moss, Ash
export const PALETTES: Record<BiomeId, BiomePalette> = {
  temperate: {
    terrain: [0x5f9140, 0x8a6a44, 0x7c766b, 0xcdb47c, 0xe8eef2, 0xa08458, 0x4c7d33, 0x3a3432],
    blight: 0x3b2d3f,
    water: 0x2f7da0,
    waterDeep: 0x174a6e,
    sky: 0x9cc9e8,
    skyNight: 0x0b1224,
    sun: 0xfff1d6,
    ambient: 0xbfd4ff,
    ground: 0x5a4a32,
    grassTuft: 0x6da44a,
    rock: 0x8a857a,
  },
  winter: {
    terrain: [0x8aa592, 0x8c8172, 0x8c8f98, 0xb8b8b8, 0xe9f0f7, 0xa9a59b, 0xa4bbb0, 0x4a4a4a],
    blight: 0x3e3348,
    water: 0x5f9bc0,
    waterDeep: 0x2f6488,
    sky: 0xc6d8ea,
    skyNight: 0x0d1428,
    sun: 0xf6f8ff,
    ambient: 0xd0dcff,
    ground: 0x7a7a80,
    grassTuft: 0x9ab8a4,
    rock: 0x9a9ca6,
  },
  badlands: {
    terrain: [0xa39350, 0xb47c4c, 0xa56c4c, 0xdcb87e, 0xe8e0d0, 0xc29c6c, 0x8e8e4c, 0x5a4a3a],
    blight: 0x46303f,
    water: 0x3b8a96,
    waterDeep: 0x1f5a6a,
    sky: 0xe6cfa6,
    skyNight: 0x1a1222,
    sun: 0xffe6c0,
    ambient: 0xffe0c8,
    ground: 0x8a5a3a,
    grassTuft: 0xa89a5a,
    rock: 0xa87050,
  },
  marsh: {
    terrain: [0x4c6c3c, 0x5c4c34, 0x5c5c54, 0x8c7c54, 0xd0d8d0, 0x6c5c3c, 0x3d5c2d, 0x2a2a26],
    blight: 0x34283a,
    water: 0x3d5c44,
    waterDeep: 0x223a2c,
    sky: 0xa8b8a8,
    skyNight: 0x0a1410,
    sun: 0xf0f0d8,
    ambient: 0xc8d8c0,
    ground: 0x3a3424,
    grassTuft: 0x5a7a3a,
    rock: 0x6a6a5c,
  },
  ashen: {
    terrain: [0x5c4c3c, 0x4c3c34, 0x3e3838, 0x6c5c4c, 0x9a9090, 0x5c4c3c, 0x4c3c2c, 0x2c2828],
    blight: 0x30242e,
    water: 0xd85a1c,
    waterDeep: 0xa83a10,
    sky: 0x8a6a5a,
    skyNight: 0x1a0c0c,
    sun: 0xffc8a0,
    ambient: 0xd0a090,
    ground: 0x2a2020,
    lava: true,
    grassTuft: 0x6a5a3a,
    rock: 0x4a4444,
  },
};

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
export function mixHex(a: number, b: number, t: number): number {
  return tmpA.setHex(a).lerp(tmpB.setHex(b), t).getHex();
}
export function shade(hex: number, f: number): number {
  tmpA.setHex(hex);
  tmpA.r = Math.min(1, tmpA.r * f);
  tmpA.g = Math.min(1, tmpA.g * f);
  tmpA.b = Math.min(1, tmpA.b * f);
  return tmpA.getHex();
}
