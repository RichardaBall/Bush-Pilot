import * as THREE from 'three';

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

function crossTuftGeometry() {
  const w = 0.7;
  const h = 1.05;
  const positions = [];
  const normals = [];
  const pushTri = (ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  };
  const planes = [
    [-w / 2, 0, 0, w / 2, 0, 0, w / 2, h, 0, -w / 2, h, 0, 0, 0, 1],
    [0, 0, -w / 2, 0, 0, w / 2, 0, h, w / 2, 0, h, -w / 2, 1, 0, 0]
  ];
  for (const p of planes) {
    pushTri(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[12], p[13], p[14]);
    pushTri(p[0], p[1], p[2], p[6], p[7], p[8], p[9], p[10], p[11], p[12], p[13], p[14]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geo;
}

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.size = 7200;
    this.segments = 800;
    this.step = this.size / this.segments;
    this.oceanTime = 0;
    this._info = {};
    this._color = [0, 0, 0];

    this.clearings = [
      { x: 0, z: 150, rx: 85, rz: 190, rot: 0, h: null },
      { x: 1100, z: -350, rx: 50, rz: 125, rot: 0.45, h: null },
      { x: -1500, z: 560, rx: 48, rz: 120, rot: -0.35, h: null },
      { x: 360, z: -1180, rx: 55, rz: 135, rot: 0.9, h: null },
      { x: -220, z: 1480, rx: 44, rz: 110, rot: 0.2, h: null },
      { x: 1680, z: 260, rx: 50, rz: 105, rot: 1.05, h: null }
    ];

    this.rivers = [
      buildRiver([
        [-920, -380],
        [-480, 120],
        [40, 560],
        [520, 980],
        [980, 1240],
        [1460, 1120],
        [1780, 1540],
        [2140, 1880],
        [2520, 1760],
        [2860, 2140]
      ]),
      buildRiver([
        [-1000, -820],
        [-780, -1240],
        [-360, -1480],
        [80, -1760],
        [520, -1620],
        [860, -2040],
        [1280, -1880],
        [1560, -2300],
        [1960, -2480],
        [2320, -2860]
      ])
    ];

    for (let i = 0; i < this.clearings.length; i++) {
      const raw = this.computeHeight(this.clearings[i].x, this.clearings[i].z);
      this.clearings[i].h = Math.min(12, Math.max(2.4, raw));
    }

    this.initTerrain();
    this.initRivers();
    this.initOcean();
    this.initProps();
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

  islandRadius(x, z, ang) {
    const n = this.fbm(x * 0.00072 + 4.2, z * 0.00072 - 6.5, 4);
    const lobes = Math.sin(ang * 2) * 160 + Math.sin(ang * 5 + 1.7) * 90 + Math.cos(ang * 3 - 0.6) * 70;
    return 2280 + lobes + (n - 0.5) * 620;
  }

  cliffStrength(x, z, ang) {
    const west = smoother(280, -500, x);
    const bands = 0.5 + 0.5 * Math.sin(ang * 2 + 0.7);
    const n = this.fbm(x * 0.0009 + 2, z * 0.0009, 3);
    return west * smoother(0.46, 0.74, bands * 0.45 + n * 0.75);
  }

  inlandHeight(x, z) {
    const broad = this.fbm(x * 0.00145, z * 0.00145, 4);
    const fine = this.fbm(x * 0.0034 + 22, z * 0.0034 - 14, 3);
    let h = 4.4 + broad * 6.8 + (fine - 0.5) * 2.2;

    const md = Math.hypot(x + 1200, z + 1000);
    const mMask = smoother(1700, 220, md);
    if (mMask > 0.001) {
      const rn = this.fbm(x * 0.00125 + 3, z * 0.00125 - 5, 4);
      const ridged = 1 - Math.abs(rn * 2 - 1);
      h += mMask * (22 + ridged * ridged * 150);
      h += (this.fbm(x * 0.0055 + 1, z * 0.0055, 3) - 0.5) * 16 * mMask;
    }
    return h;
  }

  waterAt(t) {
    const drop = smoother(0.02, 0.48, t);
    const mid = lerp(34, 0.55, drop);
    const mouth = smoother(0.78, 1, t);
    return lerp(mid, 0.08, mouth);
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
    for (let i = 0; i < this.rivers.length; i++) {
      const hit = this.closestOnRiver(x, z, this.rivers[i]);
      if (hit && hit.d < bestD) {
        bestD = hit.d;
        bestT = hit.t;
      }
    }
    return { d: bestD, t: bestT };
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
      const w = 1 - smoother(0.32, 1, e);
      if (w > best) {
        best = w;
        target = c.h;
      }
    }
    return { w: best, h: target };
  }

  applyCoast(x, z, inland, info) {
    const s = info.shoreDist;
    const reach = info.beachReach;
    const seabed = Math.max(-32, s * 0.05 + (this.fbm(x * 0.0035, z * 0.0035, 2) - 0.5) * 0.8);
    let coastH;
    if (info.cliff > 0.6) {
      const drop = smoother(34, -16, s);
      const lip = Math.max(14, inland * 0.66);
      const cliffH = lerp(lip, Math.min(seabed, -0.4), drop);
      const above = smoother(34, 155, s);
      coastH = lerp(cliffH, inland, above);
    } else {
      const shelf = smoother(-26, reach, s);
      const beachH = shelf * shelf * 2.7;
      const inlandW = smoother(reach * 0.72, reach + 120, s);
      coastH = lerp(beachH, inland, inlandW);
      if (s < 2) {
        const u = smoother(2, -22, s);
        coastH = lerp(coastH, seabed, u);
      }
    }
    const zone = 1 - smoother(reach + 70, reach + 190, s);
    return lerp(inland, coastH, zone);
  }

  applyRiver(x, z, h, info) {
    const d = info.riverDist;
    const t = info.riverT;
    if (d > 145) return { h, onBar: false };

    const water = this.waterAt(t);
    const bank = water + 1.3 + d * 0.24;
    const valleyT = smoother(145, 14, d);
    h = lerp(h, Math.min(h, bank), valleyT);

    if (d < 12) {
      h = lerp(h, water - 0.72, smoother(12, 4.5, d));
    }

    let onBar = false;
    if (t > 0.5 && water < 2.4 && d > 13 && d < 80 && h < 18) {
      const barH = water + 0.95 + (this.fbm(x * 0.02 + 1.7, z * 0.02, 2) - 0.5) * 0.16;
      const k = smoother(13, 20, d) * (1 - smoother(46, 80, d));
      h = lerp(h, barH, k * 0.95);
      onBar = k > 0.45;
    }
    return { h, onBar };
  }

  computeHeight(x, z) {
    const info = this._info;
    const dist = Math.hypot(x, z);
    const ang = dist > 0.001 ? Math.atan2(z, x) : 0;
    const shoreDist = this.islandRadius(x, z, ang) - dist;
    const river = this.closestRiver(x, z);

    info.shoreDist = shoreDist;
    info.riverDist = river.d;
    info.riverT = river.t;

    if (shoreDist < -150 && river.d > 160) {
      info.beachReach = 90;
      info.cliff = 0;
      info.onBar = false;
      info.clearing = 0;
      info.forest = false;
      info.height = Math.max(-32, shoreDist * 0.045);
      return info.height;
    }

    info.beachReach = 82 + this.fbm(x * 0.0013 + 11, z * 0.0013, 2) * 48;
    info.cliff = shoreDist < 280 ? this.cliffStrength(x, z, ang) : 0;

    let h = this.inlandHeight(x, z);
    h = this.applyCoast(x, z, h, info);
    const carved = this.applyRiver(x, z, h, info);
    h = carved.h;
    info.onBar = carved.onBar;

    const clearing = this.clearingWeight(x, z);
    info.clearing = clearing.w;
    if (clearing.w > 0) h = lerp(h, clearing.h, clearing.w);

    if (clearing.w < 0.3 && !info.onBar && shoreDist > info.beachReach && h > 1 && h < 42 && info.cliff < 0.45) {
      h += (this.fbm(x * 0.017 + 4, z * 0.017, 2) - 0.5) * 0.55 * (1 - clearing.w);
    }

    info.forest = this.fbm(x * 0.00105 + 6.5, z * 0.00105 - 4.2, 3) > 0.52;
    info.height = h;
    return h;
  }

  classify(info, height, slope) {
    if (info.riverDist < 11 && info.riverT > 0.08) return 'river';
    if (height < 0.22) return 'ocean';
    if (info.clearing > 0.55 && height > 0.45) return 'clearing';
    if (info.onBar && height > 0.35 && height < 8) return 'gravel';
    if (info.cliff > 0.62 && info.shoreDist < 95 && info.shoreDist > -20 && height > 4) return 'rock';
    if (slope > 0.5 && height > 1.5) return 'rock';
    if (info.cliff < 0.5 && info.shoreDist < info.beachReach && info.shoreDist > -8 && height < 4.6 && height > 0.2) return 'sand';
    if (info.forest && height > 2.2 && height < 96 && slope < 0.42 && info.clearing < 0.2) return 'forest';
    if (height > 128) return 'rock';
    return 'grass';
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
      shoreDist: info.shoreDist
    };
  }

  isLandable(x, z) {
    const s = this.getSurfaceAt(x, z);
    if (s.height < 0.35 || s.slope > 0.11) return false;
    return s.kind === 'sand' || s.kind === 'gravel' || s.kind === 'clearing';
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

  colorFor(kind, h, slope, ix, iz, out) {
    const n = this.hash(ix * 13 + 5, iz * 7 + 3);
    if (h < 0.25) {
      mix3([0.62, 0.54, 0.36], [0.04, 0.14, 0.18], smoother(0.25, -12, h), out);
    } else if (kind === 'sand') {
      mix3([0.66, 0.56, 0.36], [0.78, 0.7, 0.48], n, out);
      if (h < 0.9) mix3(out, [0.55, 0.46, 0.3], smoother(0.9, 0.3, h), out);
    } else if (kind === 'gravel') {
      mix3([0.52, 0.46, 0.36], [0.66, 0.58, 0.44], n, out);
    } else if (kind === 'clearing') {
      mix3([0.55, 0.48, 0.28], [0.68, 0.58, 0.34], n, out);
    } else if (kind === 'forest') {
      mix3([0.12, 0.3, 0.11], [0.2, 0.4, 0.15], n, out);
    } else if (kind === 'rock' || kind === 'river') {
      mix3([0.43, 0.41, 0.38], [0.28, 0.27, 0.26], clamp01(slope * 1.4), out);
      if (kind === 'river') mix3(out, [0.12, 0.24, 0.28], 0.45, out);
    } else {
      mix3([0.3, 0.5, 0.18], [0.46, 0.58, 0.26], n, out);
    }

    if (h > 118) mix3(out, [0.9, 0.92, 0.93], smoother(118, 156, h), out);

    const grain = (n - 0.5) * 0.05;
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
      this.colorFor(kind, h, slope, ix, iz, col);
      colors[i * 3] = col[0];
      colors[i * 3 + 1] = col[1];
      colors[i * 3 + 2] = col[2];
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    const terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0
    });

    this.mesh = new THREE.Mesh(geometry, terrainMaterial);
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
  }

  initRivers() {
    const positions = [];
    const indices = [];
    const halfW = 7.2;

    for (let r = 0; r < this.rivers.length; r++) {
      const river = this.rivers[r];
      const base = positions.length / 3;
      for (let i = 0; i < river.pts.length; i++) {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(river.pts.length - 1, i + 1);
        let tx = river.pts[i1][0] - river.pts[i0][0];
        let tz = river.pts[i1][1] - river.pts[i0][1];
        const len = Math.hypot(tx, tz) || 1;
        tx /= len;
        tz /= len;
        const nx = -tz;
        const nz = tx;
        const x = river.pts[i][0];
        const z = river.pts[i][1];
        this.computeHeight(x, z);
        if (i > 2 && this._info.shoreDist < -12) break;
        const y = this.waterAt(river.tOf[i]) + 0.06;
        positions.push(x + nx * halfW, y, z + nz * halfW);
        positions.push(x - nx * halfW, y, z - nz * halfW);
        if (i > 0) {
          const a = base + (i - 1) * 2;
          const b = a + 1;
          const c = base + i * 2;
          const d = c + 1;
          indices.push(a, b, c, b, d, c);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x1c7c88,
      roughness: 0.18,
      metalness: 0.22,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.riverMesh = new THREE.Mesh(geo, mat);
    this.riverMesh.renderOrder = 2;
    this.scene.add(this.riverMesh);
  }

  initOcean() {
    const fog = this.scene.fog;
    const uniforms = {
      uTime: { value: 0 },
      uSun: { value: new THREE.Vector3(0.45, 0.8, 0.28).normalize() },
      uDeep: { value: new THREE.Color(0x0e6ea4) },
      uShallow: { value: new THREE.Color(0x67d4d2) },
      uFogColor: { value: fog ? fog.color.clone() : new THREE.Color(0x87ceeb) },
      uFogDensity: { value: fog && fog.density ? fog.density : 0.00016 }
    };

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms,
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        void main() {
          vec3 p = position;
          float A = p.x * 0.012 + uTime * 0.45;
          float B = p.y * 0.010 + uTime * 0.32;
          float sA = sin(A);
          float cA = cos(A);
          float sB = sin(B);
          float cB = cos(B);
          float w1 = sA * cB;
          float d1x = cA * 0.012 * cB;
          float d1y = sA * (-sB) * 0.010;
          float C = (p.x + p.y) * 0.02 - uTime * 0.55;
          float w2 = sin(C) * 0.55;
          float dC = cos(C) * 0.02 * 0.55;
          float amp = 0.48;
          float dhdx = (d1x + dC) * amp;
          float dhdy = (d1y + dC) * amp;
          p.z += (w1 + w2) * amp;
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          vec3 nLocal = normalize(vec3(-dhdx, -dhdy, 1.0));
          vNormalW = normalize(mat3(modelMatrix) * nLocal);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 uSun;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        void main() {
          vec3 N = normalize(vNormalW);
          vec3 V = normalize(cameraPosition - vWorld);
          float dist = length(vWorld.xz);
          float nearIsle = 1.0 - smoothstep(1600.0, 5200.0, dist);
          vec3 col = mix(uDeep, uShallow, nearIsle);
          vec3 H = normalize(uSun + V);
          float spec = pow(max(dot(N, H), 0.0), 90.0);
          col += spec * vec3(0.55, 0.58, 0.52);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
          col = mix(col, vec3(0.82, 0.9, 0.93), fres * 0.16);
          float crest = pow(max(N.y, 0.0), 8.0) * nearIsle;
          col = mix(col, vec3(0.85, 0.92, 0.9), crest * 0.18);
          float fogDist = length(cameraPosition - vWorld);
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * fogDist * fogDist);
          col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));
          float alpha = mix(0.9, 0.55, nearIsle);
          gl_FragColor = vec4(col, alpha);
        }
      `
    });

    const geo = new THREE.PlaneGeometry(36000, 36000, 200, 200);
    this.ocean = new THREE.Mesh(geo, material);
    this.ocean.rotation.x = -Math.PI / 2;
    this.ocean.position.y = 0;
    this.ocean.renderOrder = 1;
    this.ocean.frustumCulled = false;
    this.scene.add(this.ocean);
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

  initProps() {
    const rng = mulberry32(0x5a17c3);
    const dummy = new THREE.Object3D();

    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.4, 2.6, 5);
    trunkGeo.translate(0, 1.3, 0);
    const coniferGeo = new THREE.ConeGeometry(1.75, 6.6, 6);
    coniferGeo.translate(0, 5.7, 0);
    const broadTrunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 2.1, 5);
    broadTrunkGeo.translate(0, 1.05, 0);
    const crownGeo = new THREE.SphereGeometry(2.15, 6, 5);
    crownGeo.translate(0, 3.35, 0);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4e32, roughness: 0.9 });
    const coniferMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84 });

    const coniferCount = 2800;
    const broadCount = 1600;
    const coniferTrunk = new THREE.InstancedMesh(trunkGeo, trunkMat, coniferCount);
    const coniferCrown = new THREE.InstancedMesh(coniferGeo, coniferMat, coniferCount);
    const broadTrunk = new THREE.InstancedMesh(broadTrunkGeo, trunkMat, broadCount);
    const broadCrown = new THREE.InstancedMesh(crownGeo, crownMat, broadCount);

    const coniferColor = new THREE.Color();
    const broadColor = new THREE.Color();
    let conifers = 0;
    let broads = 0;
    for (let n = 0; n < 22000 && (conifers < coniferCount || broads < broadCount); n++) {
      const [x, z] = this.sampleDisc(rng, 2900);
      const surface = this.getSurfaceAt(x, z);
      if (surface.kind !== 'forest' || surface.height < 2 || surface.slope > 0.48) continue;
      const scale = 0.75 + rng() * 1.05;
      dummy.position.set(x, surface.height, z);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      dummy.scale.set(scale, scale * (0.85 + rng() * 0.35), scale);
      dummy.updateMatrix();
      if (rng() < 0.62 && conifers < coniferCount) {
        coniferTrunk.setMatrixAt(conifers, dummy.matrix);
        coniferCrown.setMatrixAt(conifers, dummy.matrix);
        coniferColor.setRGB(0.1 + rng() * 0.08, 0.32 + rng() * 0.16, 0.1);
        coniferCrown.setColorAt(conifers, coniferColor);
        conifers++;
      } else if (broads < broadCount) {
        broadTrunk.setMatrixAt(broads, dummy.matrix);
        broadCrown.setMatrixAt(broads, dummy.matrix);
        broadColor.setRGB(0.16 + rng() * 0.12, 0.4 + rng() * 0.18, 0.1);
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
    const rockCount = 800;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    const rockColor = new THREE.Color();
    let rockN = 0;
    for (let n = 0; n < 14000 && rockN < rockCount; n++) {
      const [x, z] = this.sampleDisc(rng, 2800);
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

    const grassGeo = crossTuftGeometry();
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      side: THREE.DoubleSide
    });
    const grassCount = 6500;
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    const grassColor = new THREE.Color();
    let grassN = 0;
    for (let n = 0; n < 16000 && grassN < grassCount; n++) {
      let x;
      let z;
      if (rng() < 0.22) {
        const c = this.clearings[(rng() * this.clearings.length) | 0];
        x = c.x + (rng() - 0.5) * c.rx * 2.4;
        z = c.z + (rng() - 0.5) * c.rz * 2.4;
      } else {
        const sample = this.sampleDisc(rng, 2700);
        x = sample[0];
        z = sample[1];
      }
      const surface = this.getSurfaceAt(x, z);
      if (surface.height < 0.8 || surface.slope > 0.4) continue;
      if (surface.kind !== 'grass' && surface.kind !== 'forest' && surface.kind !== 'clearing') continue;
      const scale = 0.45 + rng() * 0.55;
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

  update(delta) {
    this.oceanTime += delta;
    if (this.ocean) this.ocean.material.uniforms.uTime.value = this.oceanTime;
  }
}
