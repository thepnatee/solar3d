import * as THREE from 'three/webgpu';
import { color } from 'three/tsl';
import { PALETTE, box, mat, mesh } from './kit';
import { OVERHANG, SLAB, type HouseParams } from './roof';

export const PLINTH = 0.45;
const FLOOR_H = 3;

export interface HouseBuild {
  group: THREE.Group;
  /** ความสูงผนังถึงชายคา */
  wallTop: number;
  rise: number;
  doorX: number;
  inverter: THREE.Vector3;
  meter: THREE.Vector3;
}

/** วัสดุกระจกหน้าต่าง: กลางวันสะท้อนฟ้า กลางคืนมีไฟส้มอุ่นจากในบ้าน */
export function createGlassMaterial(glow: { value: number } & object): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.3, flatShading: true });
  m.colorNode = color(0x5f95a1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  m.emissiveNode = color(0xffd98a).mul(glow as any);
  return m;
}

/** หน้าต่างหันไปทาง +Z ของ group ย่อย: กรอบขาว + กระจก + ไม้คั่น + ขอบบัว */
function windowUnit(w: number, h: number, glass: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w + 0.2, h + 0.2, 0.08, PALETTE.trim, 0, 0, 0.04, false));
  g.add(box(w, h, 0.06, glass, 0, 0, 0.07, false));
  g.add(box(0.06, h, 0.05, PALETTE.trim, 0, 0, 0.11, false));
  g.add(box(w, 0.06, 0.05, PALETTE.trim, 0, h * 0.12, 0.11, false));
  g.add(box(w + 0.4, 0.09, 0.24, PALETTE.trim, 0, -h / 2 - 0.12, 0.12));
  // บานเกล็ด/บานเปิดด้านข้างสีเขียวอมฟ้า แบบบ้านไทยร่วมสมัย
  for (const s of [-1, 1]) g.add(box(0.32, h + 0.1, 0.05, 0x7fa7a0, s * (w / 2 + 0.3), 0, 0.06, false));
  return g;
}

export function buildHouse(h: HouseParams, glass: THREE.Material): HouseBuild {
  const g = new THREE.Group();
  const W = h.width;
  const D = h.depth;
  const H = FLOOR_H * h.floors;
  const p = (h.pitchDeg * Math.PI) / 180;
  const rise = (D / 2) * Math.tan(p);
  const wallTop = PLINTH + H;

  // ฐาน + ผนัง + คิ้วบัว + เสามุม
  g.add(box(W + 0.7, PLINTH, D + 0.7, 0xcfc6b8, 0, PLINTH / 2, 0));
  g.add(box(W, H, D, PALETTE.wall, 0, PLINTH + H / 2, 0));
  for (let f = 1; f <= h.floors; f++) g.add(box(W + 0.12, 0.18, D + 0.12, PALETTE.trim, 0, PLINTH + f * FLOOR_H - (f === h.floors ? 0.09 : 0), 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.24, H, 0.24, PALETTE.trim, (sx * W) / 2, PLINTH + H / 2, (sz * D) / 2));

  // หน้าต่างทุกด้าน
  const perRow = Math.max(2, Math.round(W / 3.2));
  const doorIdx = Math.floor(perRow / 2);
  const slot = (i: number) => -W / 2 + ((i + 0.5) * W) / perRow;
  const doorX = slot(doorIdx);
  for (let f = 0; f < h.floors; f++) {
    const y = PLINTH + f * FLOOR_H + 1.65;
    for (let i = 0; i < perRow; i++) {
      for (const side of [1, -1]) {
        if (f === 0 && side === 1 && i === doorIdx) continue;
        const wu = windowUnit(1.2, 1.25, glass);
        wu.position.set(slot(i), y, (side * D) / 2);
        if (side === -1) wu.rotation.y = Math.PI;
        g.add(wu);
      }
    }
    for (const side of [1, -1]) {
      const wu = windowUnit(1.0, 1.15, glass);
      wu.position.set((side * W) / 2, y, f === 0 ? -D / 4 : 0);
      wu.rotation.y = (side * Math.PI) / 2;
      g.add(wu);
    }
  }

  // ประตูหน้า + กันสาด + บันได
  g.add(box(1.5, 2.55, 0.1, PALETTE.trim, doorX, PLINTH + 1.27, D / 2 + 0.05, false));
  g.add(box(1.2, 2.3, 0.1, PALETTE.door, doorX, PLINTH + 1.15, D / 2 + 0.1, false));
  g.add(box(0.5, 0.7, 0.04, glass, doorX, PLINTH + 1.7, D / 2 + 0.16, false));
  g.add(box(0.08, 0.08, 0.08, 0xe0c060, doorX + 0.4, PLINTH + 1.1, D / 2 + 0.17, false));
  const canopy = box(2.3, 0.1, 1.2, PALETTE.roofDark, doorX, PLINTH + 2.75, D / 2 + 0.6);
  canopy.rotation.x = 0.18;
  g.add(canopy);
  for (const s of [-1, 1]) g.add(box(0.08, 0.5, 0.08, PALETTE.trim, doorX + s * 1.0, PLINTH + 2.45, D / 2 + 1.0));
  g.add(box(1.9, 0.18, 0.5, 0xd9d1c3, doorX, 0.36, D / 2 + 0.6));
  g.add(box(2.1, 0.18, 0.5, 0xd9d1c3, doorX, 0.18, D / 2 + 1.0));

  // หลังคาจั่ว + กระเบื้องเป็นแนว + ปั้นลม + ครอบสัน
  const L = D / 2 / Math.cos(p) + OVERHANG;
  const ridge = new THREE.Vector3(0, wallTop + rise, 0);
  for (const side of [1, -1]) {
    const dir = new THREE.Vector3(0, -Math.sin(p), side * Math.cos(p));
    const normal = new THREE.Vector3(0, Math.cos(p), side * Math.sin(p));
    const slab = box(W + 0.8, SLAB, L, PALETTE.roof);
    slab.position.copy(ridge).addScaledVector(dir, L / 2).addScaledVector(normal, SLAB / 2);
    slab.rotation.x = side * p;
    g.add(slab);
    for (let v = 0.3; v < L - 0.1; v += 0.42) {
      const course = box(W + 0.8, 0.05, 0.07, PALETTE.roofDark, 0, 0, 0, false);
      course.position.copy(ridge).addScaledVector(dir, v).addScaledVector(normal, SLAB + 0.02);
      course.rotation.x = side * p;
      g.add(course);
    }
    const fascia = box(W + 0.85, 0.24, 0.07, PALETTE.trim);
    fascia.position.copy(ridge).addScaledVector(dir, L).addScaledVector(normal, SLAB / 2 - 0.02);
    fascia.rotation.x = side * p;
    g.add(fascia);
    for (const sx of [-1, 1]) {
      const rake = box(0.08, 0.26, L, PALETTE.trim);
      rake.position.copy(ridge).addScaledVector(dir, L / 2).addScaledVector(normal, SLAB / 2);
      rake.position.x = sx * (W / 2 + 0.42);
      rake.rotation.x = side * p;
      g.add(rake);
    }
  }
  g.add(box(W + 0.95, 0.2, 0.36, PALETTE.roofDark, 0, wallTop + rise + SLAB + 0.02, 0));
  const gable = new THREE.BufferGeometry();
  gable.setAttribute('position', new THREE.Float32BufferAttribute([0, wallTop, -D / 2, 0, wallTop, D / 2, 0, wallTop + rise, 0], 3));
  gable.computeVertexNormals();
  for (const side of [1, -1]) {
    const tri = mesh(gable, mat(0xeedcbc, { side: THREE.DoubleSide }));
    tri.position.x = (side * W) / 2;
    g.add(tri);
    if (rise > 1.2) {
      const vent = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12), mat(PALETTE.trim), false, false);
      vent.rotation.z = Math.PI / 2;
      vent.position.set((side * (W + 0.06)) / 2, wallTop + rise * 0.42, 0);
      g.add(vent);
    }
  }

  // คอยล์ร้อนแอร์ 2 ตัว + แท็งก์น้ำ ด้านหลังบ้าน
  for (let i = 0; i < 2; i++) {
    const x = -W / 4 + i * 1.3;
    g.add(box(1.0, 0.7, 0.4, 0xe6e8ea, x, 0.8, -D / 2 - 0.28));
    const fan = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 14), mat(0x7b858f), false, false);
    fan.rotation.x = Math.PI / 2;
    fan.position.set(x + 0.15, 0.8, -D / 2 - 0.5);
    g.add(fan);
  }
  const tx = W / 2 - 1.4;
  const tz = -D / 2 - 2.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.1, 1.4, 0.1, 0x8b8f93, tx + sx * 0.55, 0.7, tz + sz * 0.55));
  g.add(box(1.4, 0.1, 1.4, 0x8b8f93, tx, 1.42, tz));
  const tank = mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.5, 14), mat(0x5d8fb7, { roughness: 0.5 }));
  tank.position.set(tx, 2.22, tz);
  g.add(tank);
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.62, 0.22, 14), mat(0x5d8fb7, { roughness: 0.5 })).translateX(tx).translateY(3.08).translateZ(tz));

  // อินเวอร์เตอร์ + มิเตอร์ ที่ผนังด้าน +X
  const inverter = new THREE.Vector3(W / 2 + 0.15, 1.7, D / 2 - 1.3);
  const meter = new THREE.Vector3(W / 2 + 0.13, 1.85, D / 2 - 2.8);
  g.add(box(0.22, 0.75, 0.55, 0xf7f7f7, inverter.x, inverter.y, inverter.z));
  g.add(box(0.05, 0.12, 0.3, 0x2fbf71, inverter.x + 0.12, inverter.y + 0.2, inverter.z, false));
  g.add(box(0.2, 0.5, 0.38, 0x9aa3ad, meter.x, meter.y, meter.z));
  return { group: g, wallTop, rise, doorX, inverter, meter };
}
