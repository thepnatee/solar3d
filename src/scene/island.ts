import * as THREE from 'three/webgpu';
import { float, mix, positionWorld, sin, smoothstep, time, uniform, vec3 } from 'three/tsl';
import { PALETTE, mat, mesh, seeded } from './kit';

/** รัศมีเกาะ (m) — บ้านและสวนอยู่ในรัศมี ~16 ม. จึงหมุนบ้านได้ทุกทิศโดยไม่ล้นขอบ */
export const ISLAND_R = 19;
export const WATER_Y = -1.5;
const TOP = 0;
const LIP = -0.35;
const BOTTOM = -3.4;

function edgeRadius(a: number): number {
  return ISLAND_R * (1 + Math.sin(a * 3 + 1.1) * 0.03 + Math.sin(a * 7 - 1.8) * 0.022 + Math.sin(a * 11 + 0.5) * 0.018);
}

/** เกาะ low-poly: หญ้าเป็นแพตช์สี, ขอบทราย, หน้าผาดิน 2 โทน */
export function buildIsland(): THREE.Group {
  const g = new THREE.Group();
  const N = 48;
  const rings = [0, 0.3, 0.55, 0.78, 0.92, 1];
  const rnd = seeded(12356);
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const pt = (ri: number, i: number): [number, number, number] => {
    const a = (i / N) * Math.PI * 2;
    const r = edgeRadius(a) * rings[ri]!;
    return [Math.cos(a) * r, TOP, Math.sin(a) * r];
  };
  const tri = (p: [number, number, number][], hex: number) => {
    c.setHex(hex);
    for (const v of p) {
      pos.push(...v);
      col.push(c.r, c.g, c.b);
    }
  };
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const outer = ri === rings.length - 2;
      const hex = outer ? (rnd() > 0.5 ? 0x86b06f : 0x7ea868) : PALETTE.grass[Math.floor(rnd() * PALETTE.grass.length)]!;
      if (ri === 0) tri([pt(0, 0), pt(1, j), pt(1, i)], hex);
      else {
        tri([pt(ri, i), pt(ri, j), pt(ri + 1, j)], hex);
        tri([pt(ri, i), pt(ri + 1, j), pt(ri + 1, i)], PALETTE.grass[Math.floor(rnd() * PALETTE.grass.length)]!);
      }
    }
  }
  // ขอบทราย + หน้าผาดิน (เรียวเข้าด้านล่างให้ดูเป็นเกาะลอย)
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const a0 = (i / N) * Math.PI * 2;
    const a1 = (j / N) * Math.PI * 2;
    const r0 = edgeRadius(a0);
    const r1 = edgeRadius(a1);
    const P = (a: number, r: number, y: number): [number, number, number] => [Math.cos(a) * r, y, Math.sin(a) * r];
    tri([P(a0, r0, TOP), P(a0, r0, LIP), P(a1, r1, LIP)], PALETTE.sand);
    tri([P(a0, r0, TOP), P(a1, r1, LIP), P(a1, r1, TOP)], 0xcdb388);
    const soil = PALETTE.soil[i % 2]!;
    tri([P(a0, r0, LIP), P(a0, r0 * 0.9, BOTTOM), P(a1, r1 * 0.9, BOTTOM)], soil);
    tri([P(a0, r0, LIP), P(a1, r1 * 0.9, BOTTOM), P(a1, r1, LIP)], soil);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const top = mesh(geo, new THREE.MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide }), false, true);
  g.add(top);

  // หินริมน้ำ
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const d = edgeRadius(a) * (1.06 + rnd() * 0.22);
    const s = 0.35 + rnd() * 1.1;
    const r = mesh(rockGeo, mat(rnd() > 0.5 ? PALETTE.rock : 0x93a6a4), true, true);
    r.scale.set(s * (1 + rnd() * 0.5), s * 0.7, s);
    r.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    r.position.set(Math.cos(a) * d, WATER_Y + s * 0.15, Math.sin(a) * d);
    g.add(r);
  }
  // เกาะเล็กไกล ๆ
  const isleGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 70 + rnd() * 90;
    const s = 3 + rnd() * 9;
    const isle = mesh(isleGeo, mat(i % 3 ? 0x9ab3ad : 0x8fb39a), false, false);
    isle.scale.set(s, s * 0.32, s * 0.8);
    isle.position.set(Math.cos(a) * d, WATER_Y, Math.sin(a) * d);
    g.add(isle);
  }
  return g;
}

export interface Water {
  mesh: THREE.Mesh;
  shallow: { value: THREE.Color };
  deep: { value: THREE.Color };
  sparkle: { value: number };
}

/** ทะเลสีฟ้าใส: ไหล่ทวีปสีเขียวมรกตรอบเกาะ + ระลอกคลื่นวิบวับ (TSL → WGSL/GLSL) */
export function buildWater(): Water {
  const shallow = uniform(new THREE.Color(0x7fe0d6));
  const deep = uniform(new THREE.Color(0x3e9fbe));
  const sparkle = uniform(1);
  const d = positionWorld.xz.length();
  const shelf = float(1).sub(smoothstep(float(ISLAND_R * 0.95), float(ISLAND_R * 2.6), d));
  const foam = smoothstep(float(ISLAND_R * 1.12), float(ISLAND_R * 0.98), d).mul(0.35);
  const ripple = sin(positionWorld.x.mul(0.85).add(time.mul(0.7)))
    .mul(sin(positionWorld.z.mul(1.05).sub(time.mul(0.55))))
    .mul(sin(positionWorld.x.mul(0.31).add(positionWorld.z.mul(0.27)).add(time.mul(0.3))));
  const glint = smoothstep(float(0.55), float(0.95), ripple).mul(0.22).mul(sparkle);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.05 });
  m.colorNode = mix(deep, shallow, shelf).add(vec3(1, 1, 1).mul(foam.add(glint)));
  const water = mesh(new THREE.CircleGeometry(400, 96), m, false, true);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  return { mesh: water, shallow, deep, sparkle };
}
