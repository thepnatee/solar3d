import * as THREE from 'three/webgpu';
import { color } from 'three/tsl';
import { PALETTE, box, mat, mesh, seeded } from './kit';
import type { HouseParams } from './roof';

export interface PropsBuild {
  group: THREE.Group;
  poleTop: THREE.Vector3;
}

function deciduous(x: number, z: number, s: number, rnd: () => number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 2.4 * s, 6), mat(PALETTE.trunk)).translateY(1.2 * s));
  const blobs = [
    [0, 3.1, 0, 1.7],
    [-0.8, 2.6, 0.3, 1.15],
    [0.75, 2.75, -0.35, 1.2],
  ] as const;
  for (const [bx, by, bz, r] of blobs) {
    const c = mesh(new THREE.IcosahedronGeometry(r * s, 1), mat(PALETTE.leaves[Math.floor(rnd() * PALETTE.leaves.length)]!));
    c.position.set(bx * s, by * s, bz * s);
    c.scale.y = 0.9;
    g.add(c);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rnd() * Math.PI;
  return g;
}

function pine(x: number, z: number, s: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 1.6 * s, 6), mat(PALETTE.trunk)).translateY(0.8 * s));
  [
    [1.7, 2.2, 1.2],
    [1.35, 1.9, 2.3],
    [0.9, 1.5, 3.3],
  ].forEach(([r, h, y], i) => g.add(mesh(new THREE.ConeGeometry(r! * s, h! * s, 8), mat(PALETTE.pine[i]!)).translateY(y! * s)));
  g.position.set(x, 0, z);
  return g;
}

function car(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.85, 0.62, 4.1, 0xe8836b, 0, 0.62, 0));
  const cabin = box(1.65, 0.6, 2.1, 0xf3f1ec, 0, 1.2, -0.25);
  g.add(cabin);
  g.add(box(1.68, 0.42, 2.0, 0x5f7f92, 0, 1.22, -0.25, false));
  g.add(box(1.5, 0.1, 0.05, 0xfff2c6, 0, 0.72, 2.06, false));
  g.add(box(1.5, 0.1, 0.05, 0xd94a3a, 0, 0.72, -2.06, false));
  const wheel = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  for (const sx of [-1, 1]) for (const sz of [-1.3, 1.3]) {
    const w = mesh(wheel, mat(0x3a4048));
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * 0.9, 0.36, sz);
    g.add(w);
  }
  return g;
}

/** สวน ทางเดิน รั้ว รถ เสาไฟ ต้นไม้ — หมุนไปพร้อมบ้าน (อยู่ในรัศมีเกาะเสมอ) */
export function buildProps(h: HouseParams, doorX: number, glow: object): PropsBuild {
  const g = new THREE.Group();
  const rnd = seeded(4242);
  const W = h.width;
  const D = h.depth;
  const front = D / 2;

  // ทางเดินหินจากประตูถึงรั้ว + ทางรถด้าน -X
  const stone = new THREE.CylinderGeometry(0.42, 0.46, 0.08, 7);
  for (let z = front + 1.6; z < Math.min(front + 6.8, 12.6); z += 0.95) {
    const s = mesh(stone, mat(PALETTE.path), false, true);
    s.position.set(doorX + (rnd() - 0.5) * 0.2, 0.04, z);
    s.rotation.y = rnd() * 3;
    g.add(s);
  }
  const drvX = -W / 2 - 2.6;
  const drvZ0 = -1;
  const drvZ1 = Math.min(front + 6.5, 11);
  g.add(box(3.4, 0.08, drvZ1 - drvZ0, 0xd6d2c8, drvX, 0.04, (drvZ0 + drvZ1) / 2, false));
  const c = car();
  c.position.set(drvX, 0.08, (drvZ0 + drvZ1) / 2 + 0.6);
  g.add(c);

  // แปลงดอกไม้หน้าบ้าน
  const bedGeo = new THREE.IcosahedronGeometry(0.13, 0);
  const flowers = new THREE.InstancedMesh(bedGeo, mat(0xffffff), 140);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  let fi = 0;
  for (const [x0, x1] of [
    [-W / 2 + 0.3, doorX - 1.2],
    [doorX + 1.2, W / 2 - 0.3],
  ] as const) {
    if (x1 - x0 < 0.6) continue;
    g.add(box(x1 - x0, 0.22, 0.75, 0x8a6a4e, (x0 + x1) / 2, 0.11, front + 0.75, false));
    for (let x = x0 + 0.15; x < x1 - 0.1 && fi < 140; x += 0.22) {
      for (const dz of [0.55, 0.95]) {
        if (fi >= 140) break;
        m4.makeTranslation(x + (rnd() - 0.5) * 0.1, 0.32 + rnd() * 0.08, front + dz);
        flowers.setMatrixAt(fi, m4);
        flowers.setColorAt(fi, col.setHex(PALETTE.flowers[Math.floor(rnd() * PALETTE.flowers.length)]!));
        fi++;
      }
    }
  }
  flowers.count = fi;
  g.add(flowers);

  // พุ่มไม้ตามมุมบ้าน
  for (const [x, z, s] of [
    [-W / 2 - 0.6, front + 0.4, 0.8],
    [W / 2 + 0.7, front + 0.6, 0.7],
    [-W / 2 - 0.5, -front - 0.6, 0.9],
    [W / 2 + 0.5, -front + 0.4, 0.6],
  ] as const) {
    const b = mesh(new THREE.IcosahedronGeometry(s, 1), mat(PALETTE.leaves[Math.floor(rnd() * 4)]!));
    b.position.set(x, s * 0.7, z);
    b.scale.y = 0.8;
    g.add(b);
  }

  // รั้วไม้ระแนงสีขาวด้านหน้า (เว้นช่องทางเดิน)
  const fz = Math.min(front + 7.2, 13);
  const picket = new THREE.BoxGeometry(0.1, 0.95, 0.06);
  const fence = new THREE.InstancedMesh(picket, mat(PALETTE.trim), 120);
  let pi = 0;
  for (const [x0, x1] of [
    [-W / 2 - 0.6, doorX - 0.9],
    [doorX + 0.9, Math.min(W / 2 + 2.2, 10.5)],
  ] as const) {
    for (let x = x0; x <= x1 && pi < 120; x += 0.32) {
      fence.setMatrixAt(pi++, m4.makeTranslation(x, 0.48, fz));
    }
    if (x1 > x0) for (const y of [0.3, 0.75]) g.add(box(x1 - x0, 0.06, 0.04, PALETTE.trim, (x0 + x1) / 2, y, fz - 0.05, false));
  }
  fence.count = pi;
  fence.castShadow = true;
  g.add(fence);

  // โคมไฟสนาม (ติดตอนกลางคืน)
  const lampMat = new THREE.MeshStandardNodeMaterial({ flatShading: true });
  lampMat.colorNode = color(0xfff3cf);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lampMat.emissiveNode = color(0xffd98a).mul((glow as any).mul(2.2));
  const lx = doorX + 1.5;
  const lz = fz - 0.8;
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.6, 6), mat(0x3d4650)).translateX(lx).translateY(1.3).translateZ(lz));
  g.add(mesh(new THREE.IcosahedronGeometry(0.24, 1), lampMat, false, false).translateX(lx).translateY(2.75).translateZ(lz));

  // เสาไฟฟ้าคอนกรีต + คอน + ลูกถ้วย
  const px = Math.min(W / 2 + 3.4, 10.8);
  const pz = Math.min(fz + 0.8, 13.2);
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.22, 8.6, 8), mat(0xb8b4ab)).translateX(px).translateY(4.3).translateZ(pz));
  g.add(box(2.4, 0.14, 0.14, 0x8b8f93, px, 7.9, pz));
  for (const s of [-1, 0, 1]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 6), mat(0xe6e2d8), false, false).translateX(px + s * 0.9).translateY(8.07).translateZ(pz));

  // ต้นไม้รอบเกาะ (หลังบ้าน + มุม) — ตำแหน่งไกลจากตัวบ้าน
  const trees: [number, number, number, 'd' | 'p'][] = [
    [-12.5, -8.5, 1.15, 'd'],
    [-6.5, -12.8, 1.05, 'p'],
    [-1, -14, 0.95, 'p'],
    [5.5, -13, 1.2, 'd'],
    [11.5, -9.5, 1, 'p'],
    [14.6, -3.5, 0.9, 'd'],
    [-15, -1.5, 1, 'd'],
    [-15.6, 5, 0.85, 'p'],
    [14.5, 6.5, 0.8, 'd'],
    [-9.5, -13.5, 0.75, 'p'],
  ];
  for (const [x, z, s, k] of trees) g.add(k === 'd' ? deciduous(x, z, s, rnd) : pine(x, z, s));

  // ดอกไม้/หญ้าแซมบนเกาะ
  const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 0.32, 4), mat(0xffffff), 260);
  let ti = 0;
  for (let k = 0; k < 900 && ti < 260; k++) {
    const a = rnd() * Math.PI * 2;
    const r = 4 + rnd() * 13;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) < W / 2 + 1.5 && Math.abs(z) < D / 2 + 2.5) continue;
    if (x < -W / 2 - 0.5 && x > -W / 2 - 4.5 && z > drvZ0 - 0.5 && z < drvZ1 + 0.5) continue;
    tuft.setMatrixAt(ti, m4.makeTranslation(x, 0.15, z));
    tuft.setColorAt(ti, col.setHex(rnd() > 0.6 ? PALETTE.flowers[Math.floor(rnd() * 5)]! : 0x5f8f55));
    ti++;
  }
  tuft.count = ti;
  g.add(tuft);

  return { group: g, poleTop: new THREE.Vector3(px - 0.9, 8.1, pz) };
}
