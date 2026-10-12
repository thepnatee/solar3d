import * as THREE from 'three/webgpu';

/** Low-poly helpers shared by the island, house and props (pastel, flat-shaded — "little world" style). */
const cache = new Map<string, THREE.MeshStandardNodeMaterial>();

export function mat(hex: number, opts: Partial<THREE.MeshStandardNodeMaterialParameters> = {}): THREE.MeshStandardNodeMaterial {
  const key = `${hex}|${JSON.stringify(opts)}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardNodeMaterial({ color: hex, roughness: 0.88, metalness: 0, flatShading: true, ...opts });
    cache.set(key, m);
  }
  return m;
}

export function mesh(geo: THREE.BufferGeometry, material: THREE.Material, cast = true, receive = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function box(w: number, h: number, d: number, hex: number | THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(w, h, d), typeof hex === 'number' ? mat(hex) : hex, cast, true);
  m.position.set(x, y, z);
  return m;
}

/** Seeded RNG so the island looks the same on every load. */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
}

export const PALETTE = {
  grass: [0x77a36c, 0x6f9962, 0x79a366, 0x82ad6e],
  sand: 0xd8c08f,
  soil: [0xa48c6e, 0x9a8065, 0x8f765c],
  path: 0xd9bd8f,
  trunk: 0x826b56,
  leaves: [0x73a766, 0x8ab16d, 0x6e9c65, 0x8fbf74],
  pine: [0x38776b, 0x2e6e64, 0x32695b],
  flowers: [0xdcb55a, 0xf2d27b, 0xd4a3a4, 0xf2ecce, 0xe58f7c],
  wall: 0xf3e4c8,
  trim: 0xfbf6ec,
  roof: 0xb6614e,
  roofDark: 0x96503f,
  door: 0x8a5a3c,
  rock: 0xa0b3b1,
};
