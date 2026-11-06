import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

function smoother(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mix3(a, b, t, out) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
  ];
}

function sampleCurve(points, perSeg) {
  const wrapped = [points[0], ...points, points[points.length - 1]];
  const raw = [];
  for (let i = 1; i < wrapped.length - 2; i++) {
    for (let s = 0; s < perSeg; s++) {
      raw.push(catmull(wrapped[i - 1], wrapped[i], wrapped[i + 1], wrapped[i + 2], s / perSeg));
    }
  }
  raw.push(points[points.length - 1]);
  return raw;
}

function buildRiver(control) {
  const pts = sampleCurve(control, 5);
  const lens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    lens.push(len);
    total += len;
  }
  const tOf = new Float32Array(pts.length);
  let acc = 0;
  for (let i = 0; i < lens.length; i++) {
    acc += lens[i];
    tOf[i + 1] = total > 0 ? acc / total : 0;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    minX = Math.min(minX, pts[i][0]);
    maxX = Math.max(maxX, pts[i][0]);
    minZ = Math.min(minZ, pts[i][1]);
    maxZ = Math.max(maxZ, pts[i][1]);
  }
  return { pts, lens, total, tOf, minX, maxX, minZ, maxZ };
}

function mergeParts(geos) {
  const parts = geos.map((geo) => (geo.index ? geo.toNonIndexed() : geo));
  let count = 0;
  for (let i = 0; i < parts.length; i++) count += parts[i].attributes.position.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  let offset = 0;
  for (let i = 0; i < parts.length; i++) {
    const pos = parts[i].attributes.position.array;
    const norm = parts[i].attributes.normal.array;
    positions.set(pos, offset);
    normals.set(norm, offset);
    offset += pos.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geo;
}

function makeConiferCrown() {
  const parts = [];
  const layers = [
    { r: 2.05, h: 3.1, y: 3.15, x: 0.15, z: 0 },
    { r: 1.55, h: 2.7, y: 4.85, x: -0.12, z: 0.08 },
    { r: 0.95, h: 2.15, y: 6.45, x: 0.05, z: -0.06 }
  ];
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const cone = new THREE.ConeGeometry(layer.r, layer.h, 7);
    cone.translate(layer.x, layer.y, layer.z);
    parts.push(cone);
  }
  return mergeParts(parts);
}

function makeBroadCrown() {
  const blobs = [
    [0, 3.45, 0, 1.65],
    [1.15, 3.05, 0.35, 1.2],
    [-1.0, 3.15, -0.25, 1.15],
    [0.15, 4.35, -0.45, 1.1],
    [-0.25, 2.55, 0.95, 1.0]
  ];
  return mergeParts(blobs.map(([x, y, z, r]) => {
    const sphere = new THREE.SphereGeometry(r, 7, 5);
    sphere.translate(x, y, z);
    return sphere;
  }));
}

function makeGrassTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 256);
  const blades = [
    [28, 18, 210],
    [52, -8, 255],
    [74, 22, 190],
    [96, 6, 240],
    [40, 30, 160]
  ];
  for (let i = 0; i < blades.length; i++) {
    const x = blades[i][0];
    const lean = blades[i][1];
    const shade = blades[i][2];
    ctx.beginPath();
    ctx.moveTo(x - 3.5, 256);
    ctx.quadraticCurveTo(x + lean * 0.45, 140, x + lean, 12);
    ctx.quadraticCurveTo(x + lean * 0.35, 140, x + 3.5, 256);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, 256, 0, 0);
    fill.addColorStop(0, `rgba(${shade - 50}, ${shade - 20}, ${shade - 80}, 1)`);
    fill.addColorStop(0.55, `rgba(${shade}, ${shade + 8}, ${shade - 30}, 1)`);
    fill.addColorStop(1, `rgba(${shade + 20}, ${shade + 24}, ${shade - 10}, 0.15)`);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function crossTuftGeometry() {
  const w = 0.85;
  const h = 1.35;
  const positions = [];
  const normals = [];
  const uvs = [];
  const pushQuad = (corners, normal) => {
    const order = [0, 1, 2, 0, 2, 3];
    for (let i = 0; i < order.length; i++) {
      const corner = corners[order[i]];
      positions.push(corner[0], corner[1], corner[2]);
      normals.push(normal[0], normal[1], normal[2]);
      uvs.push(corner[3], corner[4]);
    }
  };
  pushQuad([
    [-w / 2, 0, 0, 0, 0],
    [w / 2, 0, 0, 1, 0],
    [w / 2, h, 0, 1, 1],
    [-w / 2, h, 0, 0, 1]
  ], [0, 0, 1]);
  pushQuad([
    [0, 0, -w / 2, 0, 0],
    [0, 0, w / 2, 1, 0],
    [0, h, w / 2, 1, 1],
    [0, h, -w / 2, 0, 1]
  ], [1, 0, 0]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

const TERRAIN_DETAIL = `
float terrainHash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float terrainNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = terrainHash(i);
  float b = terrainHash(i + vec2(1.0, 0.0));
  float c = terrainHash(i + vec2(0.0, 1.0));
  float d = terrainHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

const foliageFocus = new THREE.Vector3();
const foliageReveal = { value: 0 };

function fadeNearCamera(material) {
  material.customProgramCacheKey = () => 'bush-foliage-clear';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.foliageFocus = { value: foliageFocus };
    shader.uniforms.foliageReveal = foliageReveal;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFoliageWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
        vFoliageWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
        vFoliageWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vFoliageWorld;
uniform vec3 foliageFocus;
uniform float foliageReveal;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (foliageReveal > 0.5 && vFoliageWorld.y > foliageFocus.y + 2.9) {
          vec3 toCam = vFoliageWorld - cameraPosition;
          if (dot(toCam, toCam) < 100.0) discard;
          vec3 toPlayer = foliageFocus - cameraPosition;
          float span = max(dot(toPlayer, toPlayer), 0.001);
          float along = clamp(dot(toCam, toPlayer) / span, 0.0, 1.0);
          vec3 closest = cameraPosition + toPlayer * along;
          float sightRadius = mix(18.0, 8.0, along);
          if (distance(vFoliageWorld, closest) < sightRadius) discard;
        }`);
  };
}

function createTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0
  });
  material.customProgramCacheKey = () => 'bush-terrain-detail';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorld;\nvarying vec3 vTerrainNormal;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvTerrainNormal = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <project_vertex>', 'vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vTerrainWorld;\nvarying vec3 vTerrainNormal;\n${TERRAIN_DETAIL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 xz = vTerrainWorld.xz;
        float fine = terrainNoise(xz * 1.8);
        float mid = terrainNoise(xz * 0.28);
        float grain = terrainNoise(xz * 7.5);
        float slope = 1.0 - clamp(vTerrainNormal.y, 0.0, 1.0);
        vec3 col = diffuseColor.rgb;
        col *= 0.9 + 0.16 * grain;
        col = mix(col, col * vec3(0.9, 0.96, 0.88), smoothstep(0.46, 0.78, mid) * (1.0 - slope) * 0.2);
        float crevice = smoothstep(0.22, 0.82, slope) * (0.35 + 0.65 * mid);
        col *= mix(1.0, 0.52, crevice);
        float wet = smoothstep(1.35, 0.08, vTerrainWorld.y) * (1.0 - smoothstep(0.35, 0.75, slope));
        col = mix(col, col * vec3(0.62, 0.58, 0.48), wet * 0.72);
        float foam = smoothstep(0.02, 0.22, vTerrainWorld.y) * smoothstep(0.62, 0.16, vTerrainWorld.y);
        foam *= 1.0 - smoothstep(0.2, 0.55, slope);
        col = mix(col, vec3(0.86, 0.9, 0.86), foam * (0.35 + 0.4 * fine));
        diffuseColor.rgb = col;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float shoreWet = smoothstep(1.25, 0.1, vTerrainWorld.y);
        roughnessFactor = mix(roughnessFactor, 0.42, shoreWet * 0.75);`);
  };
  return material;
}

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.size = 900;
    this.segments = 300;
    this.step = this.size / this.segments;
    this.oceanTime = 0;
    this.canopy = [];
    this._info = {};
    this._color = [0, 0, 0];
    this.clearings = [];
    this.rivers = [];
    // Southeast spit: x east, z south. Width is the half-width in meters.
    this.spit = [
      [108, 112, 30],
      [136, 156, 20],
      [156, 204, 15],
      [170, 246, 34]
    ];
    this.profileRivers();
    this.placeLake();

    this.initTerrain();
    this.initRivers();
    this.initOcean();
  }

  hash(ix, iz) {
    let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  valueNoise(x, z) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = x - x0;
    const tz = z - z0;
    const sx = tx * tx * (3 - 2 * tx);
    const sz = tz * tz * (3 - 2 * tz);
    const a = this.hash(x0, z0);
    const b = this.hash(x0 + 1, z0);
    const c = this.hash(x0, z0 + 1);
    const d = this.hash(x0 + 1, z0 + 1);
    const ab = a + (b - a) * sx;
    const cd = c + (d - c) * sx;
    return ab + (cd - ab) * sz;
  }

  fbm(x, z, octaves) {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.valueNoise(x * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  canopyRadius(ang) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const n = this.fbm(c * 2.4 + 1.7, s * 2.4 - 0.8, 2);
    return 116 + Math.sin(ang * 3 + 0.5) * 7 + Math.sin(ang * 5 - 0.9) * 3.2 + (n - 0.5) * 7;
  }

  coastRadius(ang) {
    const east = Math.max(0, Math.cos(ang));
    return this.canopyRadius(ang) + 38 + east * east * 16;
  }

  spitInside(x, z) {
    const pts = this.spit;
    let best = -1e9;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0];
      const az = pts[i][1];
      const aw = pts[i][2];
      const bx = pts[i + 1][0];
      const bz = pts[i + 1][1];
      const bw = pts[i + 1][2];
      const abx = bx - ax;
      const abz = bz - az;
      const len2 = abx * abx + abz * abz;
      let u = len2 > 1e-6 ? ((x - ax) * abx + (z - az) * abz) / len2 : 0;
      if (u < 0) u = 0;
      else if (u > 1) u = 1;
      const dist = Math.hypot(x - (ax + abx * u), z - (az + abz * u));
      const inside = aw + (bw - aw) * u - dist;
      if (inside > best) best = inside;
    }
    return best;
  }

  beachPark() {
    const ang = Math.PI / 2;
    const canopy = this.canopyRadius(ang);
    const coast = this.coastRadius(ang);
    return { x: 0, z: canopy + (coast - canopy) * 0.4, heading: 0 };
  }

  islandRadius(x, z, ang) {
    return Math.max(this.coastRadius(ang), Math.hypot(x, z) + this.spitInside(x, z));
  }

  cliffStrength() {
    return 0;
  }

  inlandHeight(x, z) {
    const broad = this.fbm(x * 0.012, z * 0.012, 3);
    const fine = this.fbm(x * 0.045 + 3, z * 0.045, 2);
    return 2.4 + broad * 3.4 + (fine - 0.5) * 1.1;
  }

  dryHeight(x, z) {
    return this.computeHeight(x, z);
  }

  profileRivers() {
    for (let r = 0; r < this.rivers.length; r++) {
      const river = this.rivers[r];
      const water = new Float32Array(river.pts.length);
      for (let i = 0; i < river.pts.length; i++) {
        const ground = this.dryHeight(river.pts[i][0], river.pts[i][1]);
        let level = ground - 0.55;
        if (i > 0) level = Math.min(level, water[i - 1] - 0.02);
        const mouth = smoother(0.84, 1, river.tOf[i]);
        level = lerp(Math.max(level, 0.2), 0.16, mouth);
        water[i] = level;
      }
      river.water = water;
    }
  }

  placeLake() {
    this.lake = null;
    if (!this.rivers.length) return;
    const river = this.rivers[0];
    let idx = 0;
    let best = 1;
    for (let i = 0; i < river.pts.length; i++) {
      const dt = Math.abs(river.tOf[i] - 0.4);
      if (dt < best) {
        best = dt;
        idx = i;
      }
    }
    const i0 = Math.max(0, idx - 1);
    const i1 = Math.min(river.pts.length - 1, idx + 1);
    const tx = river.pts[i1][0] - river.pts[i0][0];
    const tz = river.pts[i1][1] - river.pts[i0][1];
    this.lake = {
      x: river.pts[idx][0],
      z: river.pts[idx][1],
      rx: 118,
      rz: 68,
      rot: Math.atan2(tz, tx),
      level: river.water[idx]
    };
  }

  lakeEllipse(x, z) {
    const lake = this.lake;
    if (!lake) return 99;
    const dx = x - lake.x;
    const dz = z - lake.z;
    const co = Math.cos(lake.rot);
    const si = Math.sin(lake.rot);
    const lx = dx * co + dz * si;
    const lz = -dx * si + dz * co;
    return (lx * lx) / (lake.rx * lake.rx) + (lz * lz) / (lake.rz * lake.rz);
  }

  riverWater(river, t) {
    const marks = river.tOf;
    let i = 0;
    while (i < marks.length - 2 && marks[i + 1] < t) i++;
    const span = marks[i + 1] - marks[i] || 1;
    const u = Math.min(1, Math.max(0, (t - marks[i]) / span));
    return lerp(river.water[i], river.water[i + 1], u);
  }

  closestOnRiver(x, z, river) {
    if (x < river.minX - 160 || x > river.maxX + 160 || z < river.minZ - 160 || z > river.maxZ + 160) {
      return null;
    }
    let bestD = Infinity;
    let bestT = 0;
    const pts = river.pts;
    for (let i = 0; i < river.lens.length; i++) {
      const ax = pts[i][0];
      const az = pts[i][1];
      const bx = pts[i + 1][0];
      const bz = pts[i + 1][1];
      const abx = bx - ax;
      const abz = bz - az;
      const len2 = abx * abx + abz * abz;
      let u = len2 > 1e-6 ? ((x - ax) * abx + (z - az) * abz) / len2 : 0;
      if (u < 0) u = 0;
      else if (u > 1) u = 1;
      const dx = x - (ax + abx * u);
      const dz = z - (az + abz * u);
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        bestD = d;
        bestT = river.tOf[i] + (river.tOf[i + 1] - river.tOf[i]) * u;
      }
    }
    return { d: bestD, t: bestT };
  }

  closestRiver(x, z) {
    let bestD = Infinity;
    let bestT = 0;
    let bestIndex = -1;
    for (let i = 0; i < this.rivers.length; i++) {
      const hit = this.closestOnRiver(x, z, this.rivers[i]);
      if (hit && hit.d < bestD) {
        bestD = hit.d;
        bestT = hit.t;
        bestIndex = i;
      }
    }
    return { d: bestD, t: bestT, index: bestIndex };
  }

  clearingWeight(x, z) {
    let best = 0;
    let target = 0;
    for (let i = 0; i < this.clearings.length; i++) {
      const c = this.clearings[i];
      if (c.h == null) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const co = Math.cos(c.rot);
      const si = Math.sin(c.rot);
      const lx = dx * co + dz * si;
      const lz = -dx * si + dz * co;
      const e = (lx * lx) / (c.rx * c.rx) + (lz * lz) / (c.rz * c.rz);
      if (e >= 1) continue;
      const inner = c.inner != null ? c.inner : 0.32;
      const w = e <= inner ? 1 : 1 - smoother(inner, 1, e);
      if (w > best) {
        best = w;
        target = c.h;
      }
    }
    return { w: best, h: target };
  }

  // Water plane sits at this height. Shore triangles that graze it flicker.
  shoreGap(h, s) {
    const waterY = 0.12;
    if (s < 10) return Math.min(h, waterY - 0.7);
    if (s < 80 && h < waterY + 0.5) return waterY + 0.58;
    return h;
  }

  applyCoast(x, z, inland, info) {
    const s = info.shoreDist;
    const reach = info.beachReach;
    const seabed = Math.max(-32, s * 0.05 + (this.fbm(x * 0.0035, z * 0.0035, 2) - 0.5) * 0.8);
    let coastH;
    if (info.cliff > 0.6) {
      // Two layers: a grass shelf, then a short drop the cliff tiles fill.
      const lipS = 24;
      const footS = 9;
      const lipH = Math.max(14, inland);
      const footH = 1.2;
      if (s >= lipS) {
        coastH = lerp(lipH, inland, smoother(lipS, lipS + 70, s));
      } else if (s >= footS) {
        coastH = lerp(lipH, footH, smoother(lipS, footS, s));
      } else {
        coastH = this.shoreGap(
          lerp(footH, Math.min(seabed, -0.8), smoother(footS, -8, s)),
          s
        );
      }
    } else {
      const shelf = smoother(-26, reach, s);
      const beachH = shelf * shelf * 2.7;
      const inlandW = smoother(reach * 0.72, reach + 120, s);
      coastH = lerp(beachH, inland, inlandW);
      if (s < 2) {
        const u = smoother(2, -22, s);
        coastH = lerp(coastH, seabed, u);
      }
      coastH = this.shoreGap(coastH, s);
    }
    const zone = 1 - smoother(reach + 70, reach + 190, s);
    return lerp(inland, coastH, zone);
  }

  applyRiver(x, z, h, info) {
    const d = info.riverDist;
    const t = info.riverT;
    if (d > 120 || info.riverIndex < 0) return { h, onBar: false };

    const water = this.riverWater(this.rivers[info.riverIndex], t);
    const bed = water - 0.7;
    const inChannel = smoother(34, 12, d);
    h = lerp(h, Math.min(h, lerp(water + 0.35, bed, inChannel)), smoother(90, 20, d));

    let onBar = false;
    if (t > 0.55 && water < 2.2 && d > 16 && d < 70 && h < 12) {
      const barH = water + 0.55 + (this.fbm(x * 0.02 + 1.7, z * 0.02, 2) - 0.5) * 0.12;
      const k = smoother(16, 24, d) * (1 - smoother(42, 70, d));
      h = lerp(h, barH, k * 0.9);
      onBar = k > 0.45;
    }
    return { h, onBar };
  }

  applyLake(x, z, h, info) {
    const e = info.lakeE;
    if (e > 1.5) return h;
    const level = this.lake.level;
    const bed = level - 1.4;
    const shore = level + 0.7;
    const bowl = 1 - smoother(0.4, 0.95, e);
    const bank = smoother(0.72, 1.02, e) * (1 - smoother(1.02, 1.45, e));
    let out = lerp(h, bed, bowl);
    out = lerp(out, Math.max(out, shore), bank);
    const surface = level + 0.12;
    if (e < 1.25 && out < surface + 0.4 && out > surface - 1.6) {
      out = e < 0.92 ? Math.min(out, surface - 0.5) : Math.max(out, surface + 0.45);
    }
    return out;
  }

  computeHeight(x, z) {
    const info = this._info;
    const dist = Math.hypot(x, z);
    const ang = dist > 0.001 ? Math.atan2(z, x) : 0;
    const canopyDist = this.canopyRadius(ang) - dist;
    const spit = this.spitInside(x, z);
    const shoreDist = Math.max(this.coastRadius(ang) - dist, spit);

    info.shoreDist = shoreDist;
    info.canopyDist = canopyDist;
    info.onSpit = spit > 0 && canopyDist < 4;
    info.beachReach = 42;
    info.cliff = 0;
    info.onBar = false;
    info.clearing = 0;
    info.forest = canopyDist > 0.4;
    info.riverDist = 1e6;
    info.riverT = 0;
    info.riverIndex = -1;
    info.lakeE = 99;

    let h;
    if (shoreDist < -70) {
      h = Math.max(-20, -1.6 + (shoreDist + 70) * 0.18);
    } else if (shoreDist < -1) {
      h = lerp(-1.45, -0.55, smoother(-68, -2, shoreDist));
    } else if (canopyDist < 1) {
      h = lerp(0.78, 1.22, smoother(0, 34, shoreDist));
      h += (this.fbm(x * 0.08, z * 0.08, 2) - 0.5) * 0.08;
    } else {
      h = lerp(1.15, this.inlandHeight(x, z), smoother(0, 16, canopyDist));
    }

    if (!this._park) this._park = this.beachPark();
    const pad = Math.hypot(x - this._park.x, z - this._park.z);
    if (pad < 16) h = lerp(1.02, h, smoother(7, 16, pad));

    info.height = h;
    return h;
  }

  classify(info, height) {
    if (height < 0.22) return 'ocean';
    if (info.canopyDist > 0.4 && height > 0.7) return 'forest';
    if (info.shoreDist > -6 && height < 3.2) return 'sand';
    if (height < 0.45) return 'ocean';
    return 'forest';
  }

  getHeightAt(x, z) {
    const half = this.size / 2;
    if (!this.grid || x < -half || z < -half || x > half || z > half) return -24;
    const seg = this.segments;
    const fx = (x + half) / this.step;
    const fz = (z + half) / this.step;
    let x0 = Math.floor(fx);
    let z0 = Math.floor(fz);
    if (x0 < 0) x0 = 0;
    if (z0 < 0) z0 = 0;
    if (x0 >= seg) x0 = seg - 1;
    if (z0 >= seg) z0 = seg - 1;
    const tx = Math.min(1, fx - x0);
    const tz = Math.min(1, fz - z0);
    const stride = seg + 1;
    const h00 = this.grid[z0 * stride + x0];
    const h10 = this.grid[z0 * stride + x0 + 1];
    const h01 = this.grid[(z0 + 1) * stride + x0];
    const h11 = this.grid[(z0 + 1) * stride + x0 + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  slopeAt(x, z) {
    const e = this.step;
    const ddx = (this.getHeightAt(x + e, z) - this.getHeightAt(x - e, z)) / (2 * e);
    const ddz = (this.getHeightAt(x, z + e) - this.getHeightAt(x, z - e)) / (2 * e);
    return Math.hypot(ddx, ddz);
  }

  getSurfaceAt(x, z) {
    const height = this.getHeightAt(x, z);
    const slope = this.slopeAt(x, z);
    this.computeHeight(x, z);
    const info = this._info;
    return {
      height,
      slope,
      kind: this.classify(info, height, slope),
      riverDist: info.riverDist,
      shoreDist: info.shoreDist,
      canopyDist: info.canopyDist,
      onSpit: info.onSpit
    };
  }

  isLandable(x, z) {
    const s = this.getSurfaceAt(x, z);
    if (s.kind === 'ocean' || s.kind === 'river' || s.kind === 'lake' || s.height < 0.35) return false;
    // Slope is rise over run. 20 degrees is a steep bush strip; 45 degrees is a cliff.
    return s.slope <= Math.tan(20 * Math.PI / 180);
  }

  // How the surface treats a rolling Cub. accel and brake are fractions of the runway.
  groundRoll(x, z) {
    const kind = this.getSurfaceAt(x, z).kind;
    if (kind === 'clearing') return { accel: 1, brake: 1, soft: false };
    if (kind === 'sand') return { accel: 0.6, brake: 0.48, soft: true };
    if (kind === 'gravel') return { accel: 0.68, brake: 0.52, soft: true };
    if (kind === 'rock') return { accel: 0.78, brake: 0.8, soft: false };
    return { accel: 0.86, brake: 0.92, soft: false };
  }

  slopeFromGrid(ix, iz) {
    const seg = this.segments;
    const stride = seg + 1;
    const x0 = Math.max(0, ix - 1);
    const x1 = Math.min(seg, ix + 1);
    const z0 = Math.max(0, iz - 1);
    const z1 = Math.min(seg, iz + 1);
    const hL = this.grid[iz * stride + x0];
    const hR = this.grid[iz * stride + x1];
    const hD = this.grid[z0 * stride + ix];
    const hU = this.grid[z1 * stride + ix];
    const dx = Math.max(1, (x1 - x0) * this.step);
    const dz = Math.max(1, (z1 - z0) * this.step);
    return Math.hypot((hR - hL) / dx, (hU - hD) / dz);
  }

  colorFor(kind, h, slope, x, z, out) {
    const n = this.fbm(x * 0.007, z * 0.007, 3);
    const n2 = this.fbm(x * 0.018 + 5.0, z * 0.018, 2);
    if (kind === 'ocean' || h < 0.25) {
      if (h > -1.7) mix3([0.76, 0.68, 0.5], [0.4, 0.58, 0.52], smoother(-0.15, -1.7, h), out);
      else mix3([0.05, 0.32, 0.36], [0.02, 0.12, 0.16], smoother(-2, -14, h), out);
    } else if (kind === 'sand') {
      mix3([0.84, 0.76, 0.58], [0.94, 0.88, 0.72], n, out);
      if (h < 1.05) mix3(out, [0.7, 0.6, 0.42], smoother(1.05, 0.5, h), out);
    } else if (kind === 'gravel') {
      mix3([0.5, 0.44, 0.34], [0.68, 0.6, 0.46], n, out);
    } else if (kind === 'clearing') {
      mix3([0.52, 0.46, 0.28], [0.66, 0.56, 0.34], n2, out);
    } else if (kind === 'forest') {
      mix3([0.07, 0.12, 0.05], [0.12, 0.18, 0.07], n, out);
    } else if (kind === 'lake') {
      mix3([0.16, 0.42, 0.4], [0.1, 0.28, 0.3], clamp01(h / 8), out);
    } else if (kind === 'river') {
      mix3([0.42, 0.38, 0.3], [0.18, 0.4, 0.42], 0.62, out);
    } else if (kind === 'rock') {
      mix3([0.45, 0.42, 0.38], [0.3, 0.28, 0.26], clamp01(slope * 1.2), out);
    } else {
      mix3([0.2, 0.3, 0.12], [0.28, 0.38, 0.16], n, out);
    }

    if (h > 145) mix3(out, [0.9, 0.92, 0.93], smoother(145, 170, h), out);

    const grain = (n2 - 0.5) * 0.03;
    out[0] = clamp01(out[0] + grain);
    out[1] = clamp01(out[1] + grain);
    out[2] = clamp01(out[2] + grain);
    return out;
  }

  initTerrain() {
    const geometry = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
    geometry.rotateX(-Math.PI / 2);

    const stride = this.segments + 1;
    const count = stride * stride;
    this.grid = new Float32Array(count);
    this.grid.fill(-24);
    const shoreGrid = new Float32Array(count);
    const cliffGrid = new Float32Array(count);
    const riverDistGrid = new Float32Array(count);
    const riverTGrid = new Float32Array(count);
    const beachGrid = new Float32Array(count);
    const clearGrid = new Float32Array(count);
    const flagGrid = new Uint8Array(count);

    const half = this.size / 2;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.computeHeight(x, z);
      pos.setY(i, h);
      const ix = Math.round((x + half) / this.step);
      const iz = Math.round((z + half) / this.step);
      const g = iz * stride + ix;
      this.grid[g] = h;
      const info = this._info;
      shoreGrid[g] = info.shoreDist;
      cliffGrid[g] = info.cliff;
      riverDistGrid[g] = info.riverDist;
      riverTGrid[g] = info.riverT;
      beachGrid[g] = info.beachReach;
      clearGrid[g] = info.clearing;
      flagGrid[g] = (info.onBar ? 1 : 0) | (info.forest ? 2 : 0);
    }
    pos.needsUpdate = true;

    const colors = new Float32Array(pos.count * 3);
    const col = this._color;
    this.kindGrid = new Uint8Array(count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const ix = Math.min(this.segments, Math.max(0, Math.round((x + half) / this.step)));
      const iz = Math.min(this.segments, Math.max(0, Math.round((z + half) / this.step)));
      const g = iz * stride + ix;
      const info = this._info;
      info.shoreDist = shoreGrid[g];
      info.cliff = cliffGrid[g];
      info.riverDist = riverDistGrid[g];
      info.riverT = riverTGrid[g];
      info.beachReach = beachGrid[g];
      info.clearing = clearGrid[g];
      info.onBar = (flagGrid[g] & 1) !== 0;
      info.forest = (flagGrid[g] & 2) !== 0;
      const h = pos.getY(i);
      const slope = this.slopeFromGrid(ix, iz);
      const kind = this.classify(info, h, slope);
      this.kindGrid[g] = kind === 'forest' ? 1 : kind === 'grass' ? 2 : 0;
      this.colorFor(kind, h, slope, x, z, col);
      colors[i * 3] = col[0];
      colors[i * 3 + 1] = col[1];
      colors[i * 3 + 2] = col[2];
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    const terrainMaterial = createTerrainMaterial();

    this.mesh = new THREE.Mesh(geometry, terrainMaterial);
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
  }

  initRivers() {
    if (!this.rivers.length) return;
    const positions = [];
    const uvs = [];
    const indices = [];
    const halfW = 9.5;
    let cursor = 0;

    const flush = (strip) => {
      if (strip.length < 2) return;
      const base = cursor;
      for (let i = 0; i < strip.length; i++) {
        const p = strip[i];
        positions.push(p.x + p.nx * halfW, p.y, p.z + p.nz * halfW);
        positions.push(p.x - p.nx * halfW, p.y, p.z - p.nz * halfW);
        uvs.push(0, p.v, 1, p.v);
        if (i > 0) {
          const a = base + (i - 1) * 2;
          const b = a + 1;
          const c = base + i * 2;
          const d = c + 1;
          indices.push(a, b, c, b, d, c);
        }
      }
      cursor += strip.length * 2;
    };

    for (let r = 0; r < this.rivers.length; r++) {
      const river = this.rivers[r];
      let strip = [];
      let flow = 0;
      for (let i = 0; i < river.pts.length; i++) {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(river.pts.length - 1, i + 1);
        let tx = river.pts[i1][0] - river.pts[i0][0];
        let tz = river.pts[i1][1] - river.pts[i0][1];
        const len = Math.hypot(tx, tz) || 1;
        tx /= len;
        tz /= len;
        const x = river.pts[i][0];
        const z = river.pts[i][1];
        this.computeHeight(x, z);
        if (i > 2 && this._info.shoreDist < -8) break;
        if (this.lakeEllipse(x, z) < 0.98) {
          flush(strip);
          strip = [];
          continue;
        }
        if (i > 0) flow += river.lens[i - 1];
        const bed = this.getHeightAt(x, z);
        const y = Math.min(river.water[i] + 0.08, bed + 0.28);
        strip.push({
          x,
          z,
          y: Math.max(y, bed + 0.12),
          nx: -tz,
          nz: tx,
          v: flow * 0.02
        });
      }
      flush(strip);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const normals = this.waterNormals().clone();
    normals.wrapS = THREE.RepeatWrapping;
    normals.wrapT = THREE.RepeatWrapping;
    normals.repeat.set(1, 4);
    this.riverNormals = normals;

    const mat = new THREE.MeshStandardMaterial({
      color: 0x3cb4c8,
      roughness: 0.12,
      metalness: 0.22,
      emissive: 0x0b3c4c,
      emissiveIntensity: 0.45,
      normalMap: normals,
      normalScale: new THREE.Vector2(0.55, 0.55),
      transparent: true,
      opacity: 0.9,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide
    });
    this.riverMesh = new THREE.Mesh(geo, mat);
    this.riverMesh.receiveShadow = false;
    this.riverMesh.renderOrder = 2;
    this.scene.add(this.riverMesh);
  }

  waterNormals() {
    if (!this._waterNormals) {
      const tex = new THREE.TextureLoader().load(
        'https://unpkg.com/three@0.160.0/examples/textures/waternormals.jpg'
      );
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      this._waterNormals = tex;
    }
    return this._waterNormals;
  }

  makeWater(geometry, size, distortion) {
    const sun = new THREE.Vector3(210, 120, 60).normalize();
    const water = new Water(geometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: this.waterNormals(),
      sunDirection: sun,
      sunColor: 0x9eb4c4,
      waterColor: 0x1a9a9a,
      distortionScale: distortion,
      fog: true
    });
    water.material.uniforms.size.value = size;
    water.material.fragmentShader = water.material.fragmentShader.replace(
      'vec3 outgoingLight = albedo;',
      'vec3 outgoingLight = mix(albedo, waterColor, 0.42);'
    );
    water.material.polygonOffset = true;
    water.material.polygonOffsetFactor = 1;
    water.material.polygonOffsetUnits = 1;
    water.material.needsUpdate = true;
    water.rotation.x = -Math.PI / 2;
    water.renderOrder = 2;
    return water;
  }

  initOcean() {
    const geo = new THREE.PlaneGeometry(36000, 36000, 1, 1);
    this.ocean = this.makeWater(geo, 0.045, 2.6);
    this.ocean.material.uniforms.alpha.value = 1;
    this.ocean.material.transparent = false;
    this.ocean.material.depthWrite = true;
    this.ocean.position.y = 0.12;
    this.scene.add(this.ocean);
    this.initLake();
  }

  initLake() {
    const lake = this.lake;
    if (!lake) return;
    const geo = new THREE.CircleGeometry(1, 48);
    const pos = geo.attributes.position;
    const co = Math.cos(lake.rot);
    const si = Math.sin(lake.rot);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * lake.rx;
      const y = pos.getY(i) * lake.rz;
      pos.setXY(i, x * co - y * si, x * si + y * co);
    }
    pos.needsUpdate = true;
    this.lakeMesh = this.makeWater(geo, 0.12, 4.2);
    this.lakeMesh.position.set(lake.x, lake.level + 0.12, lake.z);
    this.scene.add(this.lakeMesh);
  }

  finishInstances(mesh) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    if (mesh.count > 0) this.scene.add(mesh);
  }

  sampleDisc(rng, radius) {
    const ang = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng()) * radius;
    return [Math.cos(ang) * rad, Math.sin(ang) * rad];
  }

  prepareNatureProp(root) {
    root.updateWorldMatrix(true, true);
    const parts = [];
    root.traverse((child) => {
      if (!child.isMesh) return;
      const geometry = child.geometry.clone();
      geometry.applyMatrix4(child.matrixWorld);
      const material = child.material.clone();
      material.metalness = 0;
      const matName = (material.name || '').toLowerCase();
      if (matName === 'grass' || matName === 'cliff' || matName === 'stone') {
        material.color.setRGB(1, 1, 1);
        material.roughness = matName === 'grass' ? 0.9 : 0.95;
      }
      if (material.transparent || material.alphaTest > 0) {
        material.transparent = false;
        material.alphaTest = Math.max(material.alphaTest, 0.45);
        material.depthWrite = true;
        material.side = THREE.DoubleSide;
      }
      if (/tree|palm|banana|jungle|plant|flower|bush|grass|pineapple|coconut/i.test(root.name)) {
        fadeNearCamera(material);
      }
      parts.push({ geometry, material });
    });
    if (!parts.length) return null;

    const box = new THREE.Box3();
    for (const part of parts) {
      part.geometry.computeBoundingBox();
      box.union(part.geometry.boundingBox);
    }
    const shift = new THREE.Matrix4().makeTranslation(
      -(box.min.x + box.max.x) * 0.5,
      -box.min.y,
      -(box.min.z + box.max.z) * 0.5
    );
    for (const part of parts) {
      part.geometry.applyMatrix4(shift);
      if (!part.geometry.attributes.normal) part.geometry.computeVertexNormals();
      part.geometry.computeBoundingSphere();
      if ((part.material.name || '').toLowerCase() === 'cliff') {
        const pos = part.geometry.attributes.position;
        const norm = part.geometry.attributes.normal;
        const colors = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          const top = norm.getY(i) > 0.45;
          colors[i * 3] = top ? 0.62 : 0.52;
          colors[i * 3 + 1] = top ? 0.76 : 0.53;
          colors[i * 3 + 2] = top ? 0.22 : 0.5;
        }
        part.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        part.material.vertexColors = true;
      }
    }
    return {
      name: root.name,
      parts,
      spanX: box.max.x - box.min.x,
      spanY: box.max.y - box.min.y,
      spanZ: box.max.z - box.min.z
    };
  }

  scatterNature(scene, packs = {}) {
    const props = new Map();
    const keyOf = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const addScene = (extra) => {
      if (!extra) return;
      for (const root of extra.children) {
        const prop = this.prepareNatureProp(root);
        if (prop) props.set(keyOf(prop.name), prop);
      }
    };
    addScene(scene);
    addScene(packs.grass);
    addScene(packs.cliff);
    addScene(packs.stone);

    const rng = mulberry32(0x5a17c3);
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    this.canopy = [];

    const plant = (name, max, radius, accept, options = {}) => {
      const prop = props.get(keyOf(name));
      if (!prop) return;
      const meshes = prop.parts.map((part) => new THREE.InstancedMesh(part.geometry, part.material, max));
      let placed = 0;
      const tries = max * (options.tries || 14);
      for (let n = 0; n < tries && placed < max; n++) {
        let x;
        let z;
        if (options.biasClearing && rng() < 0.38 && this.clearings.length) {
          const c = this.clearings[(rng() * this.clearings.length) | 0];
          x = c.x + (rng() - 0.5) * c.rx * 2.3;
          z = c.z + (rng() - 0.5) * c.rz * 2.3;
        } else {
          const sample = this.sampleDisc(rng, radius);
          x = sample[0];
          z = sample[1];
        }
        const surface = this.getSurfaceAt(x, z);
        const scale = accept(surface, x, z, rng);
        if (!scale) continue;
        if (options.apart) {
          const min2 = options.apart.min * options.apart.min;
          const crowded = options.apart.sites.some((p) => {
            const dx = p.x - x;
            const dz = p.z - z;
            return dx * dx + dz * dz < min2;
          });
          if (crowded) continue;
        }
        if (options.place) {
          options.place(dummy, surface, x, z, rng, prop, scale);
        } else {
          const sink = options.sink ? options.sink(scale, prop, rng) : Math.min(0.15, scale * 0.04);
          dummy.position.set(x, surface.height - sink, z);
          if (options.orient) options.orient(dummy, surface, x, z, rng, prop);
          else dummy.rotation.set((rng() - 0.5) * 0.06, rng() * Math.PI * 2, (rng() - 0.5) * 0.06);
        }
        const stretch = options.stretch ? options.stretch(rng) : 0.9 + rng() * 0.2;
        dummy.scale.set(scale, scale * stretch, scale);
        dummy.updateMatrix();
        if (options.color) options.color(tint, rng, surface);
        else {
          const shade = 0.82 + rng() * 0.28;
          tint.setRGB(shade, shade, shade);
        }
        for (const mesh of meshes) {
          mesh.setMatrixAt(placed, dummy.matrix);
          mesh.setColorAt(placed, tint);
        }
        if (options.apart) options.apart.sites.push({ x, z });
        if (options.canopy) {
          this.canopy.push({
            x,
            z,
            r: Math.max(prop.spanX, prop.spanZ) * scale * 0.46,
            top: dummy.position.y + prop.spanY * dummy.scale.y
          });
        }
        placed++;
      }
      for (const mesh of meshes) {
        mesh.count = placed;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        this.finishInstances(mesh);
      }
    };

    const forestTree = (surface) => surface.kind === 'forest' && surface.height > 0.85 && surface.slope < 0.55;
    const tree = {
      canopy: true,
      color: (tint, r) => {
        const lift = r();
        tint.setRGB(0.86 + lift * 0.14, 0.9 + lift * 0.1, 0.82 + lift * 0.1);
      }
    };
    const jungle = (s, _x, _z, r) => (forestTree(s) ? 2.3 + r() * 1.15 : 0);
    plant('JungleTree01', 340, 140, jungle, tree);
    plant('JungleTree02', 280, 140, jungle, tree);
    plant('JungleTree01', 120, 70, jungle, tree);
    plant('JungleTree02', 90, 70, jungle, tree);
    plant('BananaTree01', 90, 130, (s, _x, _z, r) => (forestTree(s) ? 1.7 + r() * 0.7 : 0), tree);
    plant('BananaTree02', 70, 130, (s, _x, _z, r) => (forestTree(s) ? 1.5 + r() * 0.6 : 0), tree);

    const palm = (s, _x, _z, r) => {
      if (s.onSpit || s.canopyDist > 20 || s.canopyDist < -3) return 0;
      if (s.kind !== 'forest' && s.kind !== 'sand') return 0;
      return 1.9 + r() * 0.8;
    };
    plant('Palm01', 70, 150, palm, tree);
    plant('Palm02', 60, 150, palm, tree);
    plant('Palm03', 36, 150, palm, tree);

    const supported = (x, z, h) => {
      return this.getHeightAt(x + 5, z) > h - 2.5
        && this.getHeightAt(x - 5, z) > h - 2.5
        && this.getHeightAt(x, z + 5) > h - 2.5
        && this.getHeightAt(x, z - 5) > h - 2.5;
    };
    const stoneHere = (s, x, z, r) => {
      if (s.slope > 0.48 || !supported(x, z, s.height)) return 0;
      const bar = s.kind === 'gravel';
      const cliff = s.kind === 'rock' && s.slope > 0.16;
      const shore = s.kind === 'sand' && !s.onSpit && s.canopyDist > -28 && r() < 0.08;
      if (!bar && !cliff && !shore) return 0;
      return cliff ? 0.85 + r() * 1.7 : 0.45 + r() * 1.05;
    };
    const stoneColor = (color, r) => {
      const g = 0.38 + r() * 0.3;
      const warm = r();
      color.setRGB(g * (0.92 + warm * 0.12), g * 0.96, g * (0.9 - warm * 0.08));
    };
    for (const name of [
      'Icosphere', 'Icosphere.001', 'Icosphere.002', 'Icosphere.003', 'Icosphere.004',
      'Icosphere.005', 'Icosphere.006', 'Icosphere.007', 'Icosphere.008', 'Icosphere.009',
      'Icosphere.010', 'Icosphere.011', 'Icosphere.012', 'Icosphere.013', 'Icosphere.014'
    ]) {
      plant(name, 3, 160, (s, x, z, r) => stoneHere(s, x, z, r), {
        tries: 30,
        color: stoneColor,
        sink: (scale) => scale * 0.18,
        orient: (obj, _s, _x, _z, r) => {
          obj.rotation.set((r() - 0.5) * 0.35, r() * Math.PI * 2, (r() - 0.5) * 0.35);
        },
        stretch: (r) => 0.72 + r() * 0.5
      });
    }

    plant('Mushroom 1', 36, 140, (s, _x, _z, r) => {
      if (s.kind !== 'forest' || s.slope > 0.35 || s.height < 1) return 0;
      return 0.4 + r() * 0.45;
    });
    plant('Mushroom 2', 24, 140, (s, _x, _z, r) => {
      if (s.kind !== 'forest' || s.slope > 0.35 || s.height < 1) return 0;
      return 0.35 + r() * 0.4;
    });

    const understory = (s, _x, _z, r) => (s.kind === 'forest' && s.slope < 0.4 ? 0.9 + r() * 0.55 : 0);
    plant('TropicalPlant01', 200, 140, understory);
    plant('TropicalPlant02', 180, 140, understory);
    plant('TropicalPlant03', 160, 140, understory);
    plant('PineapplePlant', 90, 140, understory);
    plant('TropicalFlower01', 120, 140, (s, _x, _z, r) => (s.kind === 'forest' ? 0.85 + r() * 0.4 : 0));
    plant('TropicalFlower01.001', 100, 140, (s, _x, _z, r) => (s.kind === 'forest' ? 0.85 + r() * 0.4 : 0));
    plant('Banana', 40, 130, (s, _x, _z, r) => (s.kind === 'forest' ? 0.8 + r() * 0.4 : 0));
    plant('Coconut', 36, 140, (s, _x, _z, r) => (s.kind === 'forest' ? 0.8 + r() * 0.35 : 0));
    plant('CoconutHalf', 24, 140, (s, _x, _z, r) => (s.kind === 'forest' ? 0.8 + r() * 0.35 : 0));
    plant('Pineapple', 30, 130, (s, _x, _z, r) => (s.kind === 'forest' ? 0.85 + r() * 0.35 : 0));

    this.scatterStaticGrass(props);
    this.buildCliffCoast(props);

    const rockTint = (color, r) => {
      const g = 0.42 + r() * 0.2;
      color.setRGB(g, g * 0.97, g * 0.91);
    };

    const ledge = (s, x, z, r) => {
      if (s.slope > 0.46 || !supported(x, z, s.height)) return 0;
      if (s.kind === 'rock' && s.slope > 0.28 && s.height > 6) return 0.62 + r() * 0.4;
      if (s.kind === 'gravel' && s.slope < 0.2) return 0.5 + r() * 0.3;
      return 0;
    };
    const ledgeSites = [];
    const ledgeOpts = {
      tries: 28,
      color: rockTint,
      orient: (obj, _s, x, z, r, prop) => {
        const e = 12;
        const gx = this.getHeightAt(x + e, z) - this.getHeightAt(x - e, z);
        const gz = this.getHeightAt(x, z + e) - this.getHeightAt(x, z - e);
        const downhill = Math.atan2(-gz, -gx);
        const tx = -Math.sin(downhill);
        const tz = Math.cos(downhill);
        let yaw = Math.atan2(-tz, tx) + Math.PI;
        if (prop.spanZ > prop.spanX) yaw += Math.PI / 2;
        obj.rotation.set((r() - 0.5) * 0.08, yaw + (r() - 0.5) * 0.35, (r() - 0.5) * 0.08);
      },
      stretch: (r) => 0.75 + r() * 0.35,
      sink: (scale, prop) => Math.min(1.6, prop.spanY * scale * 0.35),
      apart: { min: 28, sites: ledgeSites }
    };
    for (const name of ['Rocktile straight1', 'Rocktile straight2', 'Rocktile diagonal', 'Rocktile convex', 'Rocktile pass']) {
      plant(name, 26, 3000, (s, x, z, r) => ledge(s, x, z, r), ledgeOpts);
    }

    if (!packs.grass) this.addGrass(rng, dummy);
  }

  initProps() {
    const rng = mulberry32(0x5a17c3);
    const dummy = new THREE.Object3D();

    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.42, 3.1, 6);
    trunkGeo.translate(0, 1.55, 0);
    const coniferGeo = makeConiferCrown();
    const broadTrunkGeo = new THREE.CylinderGeometry(0.22, 0.46, 2.4, 6);
    broadTrunkGeo.translate(0, 1.2, 0);
    const crownGeo = makeBroadCrown();

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4e32, roughness: 0.9 });
    const coniferMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84 });

    const coniferCount = 420;
    const broadCount = 260;
    const coniferTrunk = new THREE.InstancedMesh(trunkGeo, trunkMat, coniferCount);
    const coniferCrown = new THREE.InstancedMesh(coniferGeo, coniferMat, coniferCount);
    const broadTrunk = new THREE.InstancedMesh(broadTrunkGeo, trunkMat, broadCount);
    const broadCrown = new THREE.InstancedMesh(crownGeo, crownMat, broadCount);

    const coniferColor = new THREE.Color();
    const broadColor = new THREE.Color();
    let conifers = 0;
    let broads = 0;
    for (let n = 0; n < 8000 && (conifers < coniferCount || broads < broadCount); n++) {
      const [x, z] = this.sampleDisc(rng, 145);
      const surface = this.getSurfaceAt(x, z);
      if (surface.kind !== 'forest' || surface.height < 0.85 || surface.slope > 0.55) continue;
      const scale = 0.75 + rng() * 1.05;
      dummy.position.set(x, surface.height, z);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      dummy.scale.set(scale, scale * (0.85 + rng() * 0.35), scale);
      dummy.updateMatrix();
      if (rng() < 0.62 && conifers < coniferCount) {
        coniferTrunk.setMatrixAt(conifers, dummy.matrix);
        coniferCrown.setMatrixAt(conifers, dummy.matrix);
        coniferColor.setRGB(0.1 + rng() * 0.06, 0.28 + rng() * 0.12, 0.08);
        coniferCrown.setColorAt(conifers, coniferColor);
        conifers++;
      } else if (broads < broadCount) {
        broadTrunk.setMatrixAt(broads, dummy.matrix);
        broadCrown.setMatrixAt(broads, dummy.matrix);
        broadColor.setRGB(0.18 + rng() * 0.1, 0.36 + rng() * 0.12, 0.1);
        broadCrown.setColorAt(broads, broadColor);
        broads++;
      }
    }
    coniferTrunk.count = conifers;
    coniferCrown.count = conifers;
    broadTrunk.count = broads;
    broadCrown.count = broads;
    if (coniferCrown.instanceColor) coniferCrown.instanceColor.needsUpdate = true;
    if (broadCrown.instanceColor) broadCrown.instanceColor.needsUpdate = true;
    this.finishInstances(coniferTrunk);
    this.finishInstances(coniferCrown);
    this.finishInstances(broadTrunk);
    this.finishInstances(broadCrown);

    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96 });
    const rockCount = 40;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    const rockColor = new THREE.Color();
    let rockN = 0;
    for (let n = 0; n < 14000 && rockN < rockCount; n++) {
      const [x, z] = this.sampleDisc(rng, 160);
      const surface = this.getSurfaceAt(x, z);
      const barEdge = surface.kind === 'gravel' && surface.riverDist > 50 && surface.riverDist < 78;
      const cliffBase = surface.kind === 'rock' && surface.shoreDist < 80 && surface.shoreDist > -6 && surface.height < 48;
      const slopeRock = surface.kind === 'rock' && surface.slope > 0.36 && surface.height > 10 && rng() < 0.4;
      if (!barEdge && !cliffBase && !slopeRock) continue;
      const scale = 0.7 + rng() * 2.8;
      dummy.position.set(x, surface.height - scale * 0.12, z);
      dummy.rotation.set(rng() * 0.6, rng() * Math.PI * 2, rng() * 0.6);
      dummy.scale.set(scale, scale * (0.45 + rng() * 0.35), scale);
      dummy.updateMatrix();
      rocks.setMatrixAt(rockN, dummy.matrix);
      const g = 0.38 + rng() * 0.22;
      rockColor.setRGB(g, g * 0.97, g * 0.92);
      rocks.setColorAt(rockN, rockColor);
      rockN++;
    }
    rocks.count = rockN;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    this.finishInstances(rocks);
    this.addGrass(rng, dummy);
  }

  addGrass(rng, dummy) {
    const grassGeo = crossTuftGeometry();
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: makeGrassTexture(),
      roughness: 0.92,
      alphaTest: 0.28,
      side: THREE.DoubleSide
    });
    fadeNearCamera(grassMat);
    const grassCount = 6500;
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    const grassColor = new THREE.Color();
    let grassN = 0;
    for (let n = 0; n < 4000 && grassN < grassCount; n++) {
      const sample = this.sampleDisc(rng, 150);
      const x = sample[0];
      const z = sample[1];
      const surface = this.getSurfaceAt(x, z);
      if (surface.canopyDist > 12 || surface.canopyDist < -4) continue;
      if (surface.onSpit && surface.canopyDist < -2) continue;
      if (surface.height < 0.6 || surface.slope > 0.45) continue;
      const scale = 0.85 + rng() * 0.9;
      dummy.position.set(x, surface.height, z);
      dummy.rotation.set(0, rng() * Math.PI, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      grass.setMatrixAt(grassN, dummy.matrix);
      grassColor.setRGB(0.22 + rng() * 0.16, 0.45 + rng() * 0.22, 0.12);
      grass.setColorAt(grassN, grassColor);
      grassN++;
    }
    grass.count = grassN;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    this.finishInstances(grass);
  }

  scatterStaticGrass(props) {
    const keyOf = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const variants = [];
    for (let i = 1; i <= 6; i++) {
      const prop = props.get(keyOf('Grass_' + i));
      if (prop) variants.push(prop);
    }
    if (!variants.length || !this.kindGrid) return;

    this.grassChunks = [];
    const chunk = 70;
    const reach = 150;
    const step = 1.25;
    const half = this.size / 2;
    const stride = this.segments + 1;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    for (let cz = -reach; cz < reach; cz += chunk) {
      for (let cx = -reach; cx < reach; cx += chunk) {
        if (cx * cx + cz * cz > (reach + chunk) * (reach + chunk)) continue;
        const buckets = variants.map(() => ({ matrices: [], colors: [] }));
        for (let z = cz; z < cz + chunk; z += step) {
          for (let x = cx; x < cx + chunk; x += step) {
            const ix = Math.floor(x / step);
            const iz = Math.floor(z / step);
            const n = this.hash(ix, iz);
            const px = x + (n - 0.5) * step * 0.7;
            const pz = z + (this.hash(ix + 3, iz - 5) - 0.5) * step * 0.7;
            const edge = this.canopyRadius(Math.atan2(pz, px)) - Math.hypot(px, pz);
            if (edge < 0.8) continue;
            if (this.spitInside(px, pz) > 4) continue;
            const gx = Math.min(this.segments, Math.max(0, Math.round((px + half) / this.step)));
            const gz = Math.min(this.segments, Math.max(0, Math.round((pz + half) / this.step)));
            const code = this.kindGrid[gz * stride + gx];
            if (this.slopeFromGrid(gx, gz) > 0.48) continue;
            const h = this.getHeightAt(px, pz);
            if (h < 0.65 || code !== 1) continue;
            if (n < 0.06) continue;
            const vi = Math.abs((Math.imul(ix, 13) + Math.imul(iz, 29)) % variants.length);
            const prop = variants[vi];
            const heightScale = Math.min(1.05, (0.5 + n * 0.22) * (0.68 / Math.max(prop.spanY, 0.5)));
            const widthScale = heightScale * (code === 1 ? 1.7 : 1.15);
            dummy.position.set(px, h - 0.02, pz);
            dummy.rotation.set(0, n * Math.PI * 2, 0);
            dummy.scale.set(widthScale, heightScale * (0.85 + this.hash(ix, iz + 4) * 0.25), widthScale);
            dummy.updateMatrix();
            const lift = n * 0.12;
            tint.setRGB(
              (code === 1 ? 0.42 : 0.55) + lift,
              (code === 1 ? 0.66 : 0.76) + lift * 0.65,
              0.11 + n * 0.04
            );
            buckets[vi].matrices.push(dummy.matrix.clone());
            buckets[vi].colors.push(tint.clone());
          }
        }
        const meshes = [];
        for (let v = 0; v < variants.length; v++) {
          const list = buckets[v].matrices;
          if (!list.length) continue;
          for (const part of variants[v].parts) {
            const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
            for (let i = 0; i < list.length; i++) {
              mesh.setMatrixAt(i, list[i]);
              mesh.setColorAt(i, buckets[v].colors[i]);
            }
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.computeBoundingSphere();
            mesh.layers.set(1);
            mesh.visible = false;
            this.scene.add(mesh);
            meshes.push(mesh);
          }
        }
        if (meshes.length) this.grassChunks.push({ x: cx + chunk * 0.5, z: cz + chunk * 0.5, meshes });
      }
    }
  }

  buildCliffCoast(props) {
    const keyOf = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const names = [
      'Clifftile straight1', 'Clifftile straight2', 'Clifftile straight3',
      'Clifftile diagonal', 'Clifftile concave', 'Clifftile convex'
    ];
    const tiles = names.map((name) => props.get(keyOf(name))).filter(Boolean);
    if (!tiles.length) return;

    const lips = [];
    const rays = 360;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      let best = null;
      for (let r = 360; r > 80; r -= 8) {
        const x = ca * r;
        const z = sa * r;
        const h = this.getHeightAt(x, z);
        const foot = this.getHeightAt(x + ca * 16, z + sa * 16);
        const inland = this.getHeightAt(x - ca * 18, z - sa * 18);
        const drop = h - foot;
        if (drop > 8 && h > 12 && foot < 4 && inland > h - 6 && (!best || drop > best.drop)) {
          best = { x, z, h, a, drop, foot };
        }
      }
      if (best) lips.push(best);
    }

    const buckets = tiles.map(() => []);
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    for (let i = 0; i < lips.length; i++) {
      const lip = lips[i];
      const next = lips[(i + 1) % lips.length];
      const dx = next.x - lip.x;
      const dz = next.z - lip.z;
      const seg = Math.hypot(dx, dz);
      if (seg < 6) continue;
      const prop = tiles[i % tiles.length];
      const yScale = Math.min(2.2, Math.max(0.9, lip.drop / Math.max(prop.spanY, 6)));
      const along = Math.min(1.55, Math.max(1.05, Math.min(seg, 34) / Math.max(prop.spanX, prop.spanZ, 8)));
      const tx = dx / seg;
      const tz = dz / seg;
      let yaw = Math.atan2(-tz, tx) + Math.PI;
      if (prop.spanZ > prop.spanX) yaw += Math.PI / 2;
      dummy.position.set(
        lip.x + Math.cos(lip.a) * 12,
        lip.h - prop.spanY * yScale,
        lip.z + Math.sin(lip.a) * 12
      );
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(along, yScale, along);
      dummy.updateMatrix();
      const g = 0.9 + this.hash(i, 9) * 0.12;
      tint.setRGB(g, g, g);
      buckets[i % tiles.length].push({ matrix: dummy.matrix.clone(), color: tint.clone() });
    }

    for (let t = 0; t < tiles.length; t++) {
      const list = buckets[t];
      if (!list.length) continue;
      for (const part of tiles[t].parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        for (let i = 0; i < list.length; i++) {
          mesh.setMatrixAt(i, list[i].matrix);
          mesh.setColorAt(i, list[i].color);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
      }
    }
  }

  obstacleFloor(x, z, heading) {
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    const here = this.getHeightAt(x, z);
    let floor = here + 0.35;
    const distances = [28, 62, 105, 150];
    for (let i = 0; i < distances.length; i++) {
      const h = this.getHeightAt(x + sin * distances[i], z + cos * distances[i]);
      if (h > here + 1) floor = Math.max(floor, h + 6);
    }
    const canopy = this.canopy;
    for (let i = 0; i < canopy.length; i++) {
      const tree = canopy[i];
      const dx = tree.x - x;
      const dz = tree.z - z;
      const along = dx * sin + dz * cos;
      if (along < -8 || along > 96) continue;
      const lateral = dx * cos - dz * sin;
      if (Math.abs(lateral) > tree.r + 6) continue;
      floor = Math.max(floor, tree.top + 4);
    }
    return floor;
  }

  // Highest the Cub can be flown: clear of the tallest ground and canopy.
  flightCeiling() {
    if (this._ceiling) return this._ceiling;
    let top = 30;
    const grid = this.grid;
    if (grid) {
      for (let i = 0; i < grid.length; i++) if (grid[i] > top) top = grid[i];
    }
    const canopy = this.canopy;
    for (let i = 0; i < canopy.length; i++) if (canopy[i].top > top) top = canopy[i].top;
    this._ceiling = top + 24;
    return this._ceiling;
  }

  // True when the fuselage is inside a canopy. Height is left to the throttle.
  blocksFlight(x, z, y) {
    const canopy = this.canopy;
    for (let i = 0; i < canopy.length; i++) {
      const tree = canopy[i];
      if (y >= tree.top) continue;
      const dx = tree.x - x;
      const dz = tree.z - z;
      if (dx * dx + dz * dz > tree.r * tree.r) continue;
      if (y > tree.top - 24) return true;
    }
    return false;
  }

  scatterClouds(scene) {
    if (!scene) return;
    const props = [];
    for (const root of scene.children) {
      const prop = this.prepareNatureProp(root);
      if (prop) props.push(prop);
    }
    if (!props.length) return;
    const rng = mulberry32(0xc104d);
    const dummy = new THREE.Object3D();
    for (const prop of props) {
      const count = 14;
      for (const part of prop.parts) {
        part.material.color.setRGB(1, 1, 1);
        part.material.emissive = new THREE.Color(0xf7f4ee);
        part.material.emissiveIntensity = 0.65;
        part.material.roughness = 1;
        part.material.side = THREE.DoubleSide;
        part.material.fog = true;
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, count);
        for (let i = 0; i < count; i++) {
          const ang = rng() * Math.PI * 2;
          const rad = 400 + rng() * 2600;
          const scale = 55 + rng() * 85;
          dummy.position.set(Math.cos(ang) * rad, 260 + rng() * 280, Math.sin(ang) * rad);
          dummy.rotation.set(0, rng() * Math.PI * 2, 0);
          dummy.scale.set(scale, scale * (0.45 + rng() * 0.35), scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        this.scene.add(mesh);
      }
    }
  }

  update(delta, focusX, focusZ, focusY, reveal) {
    if (focusX != null) {
      foliageFocus.set(focusX, focusY || 0, focusZ);
      foliageReveal.value = reveal ? 1 : 0;
    }
    this.oceanTime += delta;
    if (this.ocean && this.ocean.material.uniforms.time) {
      this.ocean.material.uniforms.time.value = this.oceanTime;
    }
    if (this.lakeMesh && this.lakeMesh.material.uniforms.time) {
      this.lakeMesh.material.uniforms.time.value = this.oceanTime;
    }
    if (this.riverNormals) this.riverNormals.offset.y = this.oceanTime * 0.05;
    if (!this.grassChunks || focusX == null) return;
    const limit = 430 * 430;
    for (let i = 0; i < this.grassChunks.length; i++) {
      const chunk = this.grassChunks[i];
      const dx = chunk.x - focusX;
      const dz = chunk.z - focusZ;
      const on = dx * dx + dz * dz < limit;
      for (let m = 0; m < chunk.meshes.length; m++) chunk.meshes[m].visible = on;
    }
  }
}
