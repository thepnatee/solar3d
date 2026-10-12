import * as THREE from 'three/webgpu';
import { mix, positionWorldDirection, smoothstep, uniform } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildHouse, createGlassMaterial } from './house';
import { buildIsland, buildWater, type Water } from './island';
import { mat, mesh } from './kit';
import { createFlowMaterial, createPanelMaterial, panelPower, type FlowMaterial } from './materials';
import { buildProps } from './props';
import { PANEL_GAP, PANEL_LONG, PANEL_SHORT, SLAB, panelCapacity, type HouseParams } from './roof';
import { sunDirection, sunPosition } from './sun';
import { WeatherFX } from './weather';
import { WEATHER, type WeatherId } from './weather-model';

export { panelCapacity, usableRoofArea, type HouseParams } from './roof';

export interface FlowsKw {
  pv: number;
  self: number;
  import: number;
  export: number;
}

export interface SceneState {
  house: HouseParams;
  panelCount: number;
  lat: number;
  month: number;
  hour: number;
  flows: FlowsKw;
  /** kW ที่ใช้สเกลความเร็วของเส้นพลังงาน */
  flowScale: number;
  weather: WeatherId;
}

const C = (hex: number) => new THREE.Color(hex);
/** ชุดสีฟ้า [บน, กลาง, ขอบฟ้า] ตามเวลา/สภาพอากาศ — โทนพาสเทลแบบภาพอ้างอิง */
const SKY = {
  day: [C(0x9fcfe9), C(0xdff1f7), C(0xc2e2ed)],
  sunset: [C(0xb3b5c8), C(0xe8a38e), C(0xf3ca99)],
  night: [C(0x122c54), C(0x345778), C(0x4d799c)],
  overcast: [C(0x9fb0bd), C(0xd3dbe0), C(0xc4ced5)],
  storm: [C(0x5f6f80), C(0x8d9aa6), C(0x9eaab4)],
};

/**
 * Three r186 always sends `swizzle: 'rgba'` (identity) in texture-view descriptors. Some Chromium builds expose an
 * older experimental dictionary form of that field and reject the string, so drop the no-op value before it reaches them.
 */
function patchIdentitySwizzle(): void {
  const proto = (globalThis as { GPUTexture?: { prototype: GPUTexture } }).GPUTexture?.prototype;
  if (!proto || (proto as unknown as { __swizzlePatched?: boolean }).__swizzlePatched) return;
  const createView = proto.createView;
  proto.createView = function (this: GPUTexture, desc?: GPUTextureViewDescriptor) {
    if (desc && (desc as { swizzle?: unknown }).swizzle === 'rgba') {
      const { swizzle: _identity, ...rest } = desc as GPUTextureViewDescriptor & { swizzle?: unknown };
      return createView.call(this, rest);
    }
    return createView.call(this, desc);
  };
  (proto as unknown as { __swizzlePatched?: boolean }).__swizzlePatched = true;
}

export class SolarScene {
  readonly renderer: THREE.WebGPURenderer;
  readonly backendName: string;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private sun = new THREE.DirectionalLight(0xfff1d6, 3);
  private hemi = new THREE.HemisphereLight(0xdff1f7, 0xb9a88a, 1.3);
  private lot = new THREE.Group();
  private panelGroup = new THREE.Group();
  private sunDisc: THREE.Mesh;
  private sunHalo: THREE.Mesh;
  private panelMat: THREE.MeshStandardNodeMaterial;
  private glassMat: THREE.MeshStandardNodeMaterial;
  private windowGlow = uniform(0);
  private skyTop = uniform(new THREE.Color());
  private skyMid = uniform(new THREE.Color());
  private skyHorizon = uniform(new THREE.Color());
  private fog = new THREE.Fog(0xc2e2ed, 90, 330);
  private water: Water;
  private fx = new WeatherFX();
  private flows: { pv: FlowMaterial; home: FlowMaterial; grid: FlowMaterial } | null = null;
  private flowSpeeds = { pv: 0, home: 0, grid: 0 };
  private houseKey = '';
  private panelKey = '';
  private weatherKey: WeatherId | '' = '';
  private wallTop = 0;
  private rise = 0;
  private timer = new THREE.Timer();
  private state: SceneState | null = null;
  private baseHemi = 1;
  /** GPUDevice of the WebGPU backend (null on the WebGL2 fallback) */
  get gpuDevice(): GPUDevice | null {
    return (this.renderer.backend as { device?: GPUDevice }).device ?? null;
  }
  placedPanels = 0;
  capacity = 0;

  private constructor(private container: HTMLElement, renderer: THREE.WebGPURenderer) {
    this.renderer = renderer;
    this.backendName = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    this.panelMat = createPanelMaterial(this.backendName === 'WebGPU');
    this.glassMat = createGlassMaterial(this.windowGlow);

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 900);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 120;
    this.controls.autoRotateSpeed = 0.6;
    this.resetView();

    const y = positionWorldDirection.y;
    this.scene.backgroundNode = mix(mix(this.skyHorizon, this.skyMid, smoothstep(0.0, 0.2, y)), this.skyTop, smoothstep(0.2, 0.8, y));
    this.scene.fog = this.fog;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -24;
    sc.right = 24;
    sc.top = 24;
    sc.bottom = -24;
    sc.near = 1;
    sc.far = 160;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicNodeMaterial({ color: 0xfff4ca, fog: false }));
    this.sunHalo = new THREE.Mesh(
      new THREE.SphereGeometry(12, 24, 16),
      new THREE.MeshBasicNodeMaterial({ color: 0xfff8cd, transparent: true, opacity: 0.28, fog: false, depthWrite: false }),
    );
    this.scene.add(this.sunDisc, this.sunHalo);

    this.water = buildWater();
    this.scene.add(buildIsland(), this.water.mesh, this.fx.group, this.lot);

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    renderer.setAnimationLoop(() => this.frame());
  }

  static async create(container: HTMLElement): Promise<SolarScene> {
    patchIdentitySwizzle();
    const renderer = new THREE.WebGPURenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    await renderer.init();
    renderer.domElement.setAttribute('aria-label', 'ภาพ 3 มิติ บ้านติดโซลาร์เซลล์บนเกาะจำลอง ลากเพื่อหมุน เลื่อนเพื่อซูม');
    container.prepend(renderer.domElement);
    return new SolarScene(container, renderer);
  }

  /** พิกเซลที่แผง UI บังด้านขวา — เลื่อนจุดกึ่งกลางภาพไปทางซ้ายให้เกาะอยู่กลางพื้นที่ว่าง */
  private rightInset = 0;

  setRightInset(px: number): void {
    this.rightInset = px;
    this.resize();
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    const d = Math.min(this.rightInset * 0.22, w / 5);
    this.camera.aspect = (w + 2 * d) / h;
    if (d > 0) this.camera.setViewOffset(w + 2 * d, h, 2 * d, 0, w, h);
    else this.camera.clearViewOffset();
    // จอแคบ → ถอยกล้องให้เห็นเกาะทั้งเกาะ
    this.camera.fov = w / h < 0.9 ? 48 : 36;
    this.camera.updateProjectionMatrix();
  }

  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on;
  }

  zoom(factor: number): void {
    const off = this.camera.position.clone().sub(this.controls.target);
    const len = THREE.MathUtils.clamp(off.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(off.setLength(len));
  }

  resetView(): void {
    this.camera.position.set(37, 23, 44);
    this.controls.target.set(0, 2.5, 0);
    this.controls.update();
  }

  private buildLot(h: HouseParams): void {
    this.lot.clear();
    const hb = buildHouse(h, this.glassMat);
    this.wallTop = hb.wallTop;
    this.rise = hb.rise;
    const props = buildProps(h, hb.doorX, this.windowGlow);
    this.lot.add(hb.group, props.group, this.panelGroup);

    // เส้นพลังงาน: แผง → อินเวอร์เตอร์ → บ้าน, เสาไฟ ↔ มิเตอร์
    if (!this.flows) {
      this.flows = { pv: createFlowMaterial(0xffb020), home: createFlowMaterial(0xffd34d), grid: createFlowMaterial(0x3b8beb, 14) };
    }
    const tube = (pts: THREE.Vector3[], fm: FlowMaterial, r = 0.07) =>
      this.lot.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, r, 8, false), fm.material, false, false));
    const W = h.width;
    const D = h.depth;
    const eaveY = hb.wallTop + SLAB;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const inv = hb.inverter;
    const met = hb.meter;
    tube([V(W / 2 - 0.9, eaveY + 0.2, D / 2 - 0.5), V(W / 2 + 0.25, eaveY - 0.1, D / 2 - 0.9), V(inv.x + 0.02, 2.9, inv.z), V(inv.x + 0.02, inv.y + 0.4, inv.z)], this.flows.pv);
    tube([V(inv.x + 0.02, inv.y - 0.4, inv.z), V(inv.x, 1.0, (inv.z + met.z) / 2), V(met.x + 0.02, met.y - 0.25, met.z)], this.flows.home);
    tube([props.poleTop, V((props.poleTop.x + met.x) / 2 + 0.6, 5.6, (props.poleTop.z + met.z) / 2), V(met.x + 0.5, 3.0, met.z + 0.2), V(met.x + 0.02, met.y + 0.25, met.z)], this.flows.grid, 0.05);

    this.lot.rotation.y = this.bearingToRotation(h.bearingDeg);
    this.controls.target.set(0, Math.min(5, (hb.wallTop + hb.rise) / 2), 0);
  }

  private bearingToRotation(bearingDeg: number): number {
    const b = (bearingDeg * Math.PI) / 180;
    return Math.atan2(Math.sin(b), -Math.cos(b));
  }

  private buildPanels(h: HouseParams, count: number): void {
    this.panelGroup.clear();
    const cap = panelCapacity(h);
    this.capacity = cap.capacity;
    const n = Math.min(count, cap.capacity);
    this.placedPanels = n;
    if (n <= 0) return;
    const p = (h.pitchDeg * Math.PI) / 180;
    const pw = cap.landscape ? PANEL_LONG : PANEL_SHORT;
    const ph = cap.landscape ? PANEL_SHORT : PANEL_LONG;
    const rows = Math.ceil(n / cap.cols);
    const dir = new THREE.Vector3(0, -Math.sin(p), Math.cos(p));
    const normal = new THREE.Vector3(0, Math.cos(p), Math.sin(p));
    const ridge = new THREE.Vector3(0, this.wallTop + this.rise, 0);
    const vStart = (cap.slopeLen - rows * (ph + PANEL_GAP)) / 2;

    const frameGeo = new THREE.BoxGeometry(PANEL_SHORT, 0.05, PANEL_LONG);
    const glassGeo = new THREE.PlaneGeometry(PANEL_SHORT * 0.975, PANEL_LONG * 0.98).rotateX(-Math.PI / 2);
    const frameMat = mat(0xd5dae0, { metalness: 0.6, roughness: 0.35 });
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cap.cols);
      const inRow = r === rows - 1 ? n - r * cap.cols : cap.cols;
      const c = i % cap.cols;
      const u = (c - (inRow - 1) / 2) * (pw + PANEL_GAP);
      const v = vStart + (r + 0.5) * (ph + PANEL_GAP);
      const panel = new THREE.Group();
      panel.add(mesh(frameGeo, frameMat));
      const glass = mesh(glassGeo, this.panelMat, false, true);
      glass.position.y = 0.027;
      panel.add(glass);
      panel.position.copy(ridge).addScaledVector(dir, v).addScaledVector(normal, SLAB + 0.11);
      panel.position.x = u;
      panel.rotation.set(p, cap.landscape ? Math.PI / 2 : 0, 0, 'XYZ');
      this.panelGroup.add(panel);
    }
  }

  update(state: SceneState): void {
    this.state = state;
    const hk = JSON.stringify(state.house);
    if (hk !== this.houseKey) {
      this.houseKey = hk;
      this.buildLot(state.house);
      this.panelKey = '';
    }
    const pk = `${hk}|${state.panelCount}`;
    if (pk !== this.panelKey) {
      this.panelKey = pk;
      this.buildPanels(state.house, state.panelCount);
    }
    if (state.weather !== this.weatherKey) {
      this.weatherKey = state.weather;
      this.fx.setWeather(state.weather);
    }
    this.updateSky();
    const scale = Math.max(state.flowScale, 0.5);
    this.flowSpeeds.pv = state.flows.pv / scale;
    this.flowSpeeds.home = state.flows.self / scale;
    const net = state.flows.import - state.flows.export;
    this.flowSpeeds.grid = -net / scale; // + = ไหลไปเสาไฟ (ส่งออก), - = ไหลเข้าบ้าน (ซื้อไฟ)
    if (this.flows) {
      this.flows.pv.strength.value = Math.min(1, Math.abs(this.flowSpeeds.pv) * 1.5);
      this.flows.home.strength.value = Math.min(1, Math.abs(this.flowSpeeds.home) * 1.5);
      this.flows.grid.strength.value = Math.min(1, Math.abs(this.flowSpeeds.grid) * 1.5);
      this.flows.grid.tint.value.set(net >= 0 ? 0x3b8beb : 0x2fbf71);
    }
    panelPower.value = Math.min(1, state.flows.pv / Math.max(0.1, state.flowScale));
  }

  private updateSky(): void {
    if (!this.state) return;
    const st = this.state;
    const w = WEATHER[st.weather];
    const pos = sunPosition(st.lat, st.month, st.hour);
    const [x, y, z] = sunDirection(pos);
    this.sun.position.set(x * 70, Math.max(y, 0.03) * 70, z * 70);
    const day = THREE.MathUtils.smoothstep(y, -0.06, 0.22);
    const night = 1 - day;
    const sunset = day * (1 - THREE.MathUtils.smoothstep(y, 0.04, 0.32));
    const overcast = 1 - w.sun;

    this.sun.intensity = 3.4 * day * w.sun;
    this.sun.color.setRGB(1, 0.95 - 0.28 * sunset, 0.86 - 0.5 * sunset);
    this.hemi.color.set(0xdff1f7).lerp(C(0x7d9ccc), night);
    this.hemi.groundColor.set(0xb9a88a).lerp(C(0x34496a), night);
    this.baseHemi = 1.25 + day * (0.35 + overcast * 0.5);
    this.hemi.intensity = this.baseHemi;
    this.windowGlow.value = 1 - THREE.MathUtils.smoothstep(y, -0.1, 0.08) * (0.3 + 0.7 * w.sun);

    const clearSky = (i: number) => SKY.day[i]!.clone().lerp(SKY.sunset[i]!, sunset);
    const grey = (i: number) => (st.weather === 'storm' ? SKY.storm[i]! : SKY.overcast[i]!);
    const col = (i: number) => clearSky(i).lerp(grey(i), Math.min(1, overcast * 1.15)).lerp(SKY.night[i]!, night);
    this.skyTop.value.copy(col(0));
    this.skyMid.value.copy(col(1));
    this.skyHorizon.value.copy(col(2));
    this.fog.color.copy(col(2));

    this.water.shallow.value.set(0x7fe0d6).lerp(C(0x8ccfcb), overcast).lerp(C(0x29658d), night);
    this.water.deep.value.set(0x3e9fbe).lerp(C(0x4f8ea3), overcast).lerp(C(0x124674), night);
    this.water.sparkle.value = day * (0.25 + 0.75 * w.sun);

    const dist = 160;
    this.sunDisc.position.set(x * dist, y * dist, z * dist);
    this.sunHalo.position.copy(this.sunDisc.position);
    this.sunDisc.visible = this.sunHalo.visible = y > -0.03 && w.sun > 0.2;
    this.fx.setNight(night);
  }

  private frame(): void {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    if (this.flows) {
      this.flows.pv.offset.value += this.flowSpeeds.pv * dt * 1.6;
      this.flows.home.offset.value += this.flowSpeeds.home * dt * 1.6;
      this.flows.grid.offset.value += this.flowSpeeds.grid * dt * 1.6;
    }
    const flash = this.fx.tick(dt);
    this.hemi.intensity = this.baseHemi + flash * 3;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
