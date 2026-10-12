import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { seeded } from './kit';
import { WEATHER, type WeatherId } from './weather-model';

const RAIN_N = 1400;
const RAIN_R = 30;
const RAIN_TOP = 34;

interface Cloud {
  group: THREE.Group;
  angle: number;
  radius: number;
  speed: number;
}

/** เมฆปุย ฝน ดาว ดวงจันทร์ — สไตล์ "little weather world" */
export class WeatherFX {
  readonly group = new THREE.Group();
  private clouds: Cloud[] = [];
  private cloudTint = uniform(new THREE.Color(0xffffff));
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private rainSeed: Float32Array;
  private rainMat: THREE.LineBasicNodeMaterial;
  private stars: THREE.InstancedMesh;
  private starMat: THREE.MeshBasicNodeMaterial;
  readonly moon: THREE.Mesh;
  private weather: WeatherId = 'partly';
  private flash = 0;
  private flashTimer = 3;

  constructor() {
    const rnd = seeded(777);
    const cloudMat = new THREE.MeshStandardNodeMaterial({ flatShading: true, roughness: 1, transparent: true, opacity: 0.96 });
    cloudMat.colorNode = this.cloudTint;
    cloudMat.emissiveNode = this.cloudTint.mul(0.55);
    const puff = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 22; i++) {
      const g = new THREE.Group();
      const n = 4 + Math.floor(rnd() * 3);
      const size = 2.2 + rnd() * 2.2;
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(puff, cloudMat);
        const s = size * (0.6 + rnd() * 0.6) * (k === 0 ? 1.3 : 1);
        m.scale.set(s, s * 0.78, s);
        m.position.set((k - n / 2) * size * 0.75, rnd() * size * 0.4, (rnd() - 0.5) * size);
        g.add(m);
      }
      this.clouds.push({ group: g, angle: rnd() * Math.PI * 2, radius: 34 + rnd() * 80, speed: (0.008 + rnd() * 0.015) * (rnd() > 0.5 ? 1 : -1) });
      g.position.y = 30 + rnd() * 16;
      g.scale.setScalar(1.4 + rnd() * 0.8);
      this.group.add(g);
    }

    this.rainPos = new Float32Array(RAIN_N * 6);
    this.rainSeed = new Float32Array(RAIN_N * 3);
    for (let i = 0; i < RAIN_N; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * RAIN_R;
      this.rainSeed.set([Math.cos(a) * r, rnd() * RAIN_TOP, Math.sin(a) * r], i * 3);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rainMat = new THREE.LineBasicNodeMaterial({ color: 0xd4efff, transparent: true, opacity: 0.55 });
    this.rain = new THREE.LineSegments(rg, this.rainMat);
    this.rain.frustumCulled = false;
    this.group.add(this.rain);

    this.starMat = new THREE.MeshBasicNodeMaterial({ color: 0xf7fbff, transparent: true, opacity: 0, fog: false });
    this.stars = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 0), this.starMat, 140);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 140; i++) {
      const a = rnd() * Math.PI * 2;
      const el = 0.12 + rnd() * 1.3;
      const r = 200;
      const s = 0.6 + rnd() * 1.3;
      m4.makeScale(s, s, s).setPosition(Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(a) * Math.cos(el) * r);
      this.stars.setMatrixAt(i, m4);
    }
    this.group.add(this.stars);

    this.moon = new THREE.Mesh(new THREE.SphereGeometry(4.5, 20, 14), new THREE.MeshBasicNodeMaterial({ color: 0xe9efff, fog: false }));
    this.moon.position.set(-110, 95, -120);
    this.group.add(this.moon);
  }

  setWeather(w: WeatherId): void {
    this.weather = w;
    const info = WEATHER[w];
    this.clouds.forEach((c, i) => (c.group.visible = i < info.clouds));
    this.rain.visible = info.rain > 0;
    this.rainMat.opacity = w === 'storm' ? 0.7 : 0.5;
    this.cloudTint.value.set(w === 'storm' ? 0x8796a5 : w === 'rain' ? 0xb4c0ca : w === 'cloudy' ? 0xe6ebee : 0xffffff);
  }

  /** night 0..1 — ดาวและดวงจันทร์ */
  setNight(night: number): void {
    this.starMat.opacity = Math.max(0, night - 0.3) * 1.3 * (this.weather === 'sunny' || this.weather === 'partly' ? 1 : 0.25);
    this.stars.visible = this.starMat.opacity > 0.01;
    this.moon.visible = night > 0.5 && this.weather !== 'storm';
  }

  /** คืนค่าแสงฟ้าแลบ (0..1) สำหรับเฟรมนี้ */
  tick(dt: number): number {
    for (const c of this.clouds) {
      if (!c.group.visible) continue;
      c.angle += c.speed * dt;
      c.group.position.x = Math.cos(c.angle) * c.radius;
      c.group.position.z = Math.sin(c.angle) * c.radius;
      c.group.rotation.y = -c.angle;
    }
    const info = WEATHER[this.weather];
    if (this.rain.visible) {
      const fall = 26 * info.rain;
      for (let i = 0; i < RAIN_N; i++) {
        let y = this.rainSeed[i * 3 + 1]! - fall * dt;
        if (y < -1.5) y += RAIN_TOP;
        this.rainSeed[i * 3 + 1] = y;
        const x = this.rainSeed[i * 3]!;
        const z = this.rainSeed[i * 3 + 2]!;
        this.rainPos.set([x, y, z, x - 0.12 * info.rain, y - 0.75, z], i * 6);
      }
      (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    if (this.weather === 'storm') {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flash = 1;
        this.flashTimer = 2.5 + Math.random() * 5;
      }
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    return this.flash;
  }
}
