import * as THREE from 'three/webgpu';
import { color, mix, positionWorldDirection, smoothstep, uniform } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createFlowMaterial, createPanelMaterial, panelPower, type FlowMaterial } from './materials';
import { OVERHANG, PANEL_GAP, PANEL_LONG, PANEL_SHORT, SLAB, panelCapacity, type HouseParams } from './roof';
import { sunDirection, sunPosition } from './sun';

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
}

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
  private hemi = new THREE.HemisphereLight(0xe4f1ff, 0xb3a98f, 1.4);
  private houseGroup = new THREE.Group();
  private panelGroup = new THREE.Group();
  private sunMarker: THREE.Mesh;
  private panelMat: THREE.MeshStandardNodeMaterial;
  private windowGlow = uniform(0);
  private skyZenith = uniform(new THREE.Color(0x3b82c4));
  private skyHorizon = uniform(new THREE.Color(0xcfe6f7));
  private flows: { pv: FlowMaterial; home: FlowMaterial; grid: FlowMaterial } | null = null;
  private flowSpeeds = { pv: 0, home: 0, grid: 0 };
  private houseKey = '';
  private panelKey = '';
  private timer = new THREE.Timer();
  private state: SceneState | null = null;
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

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.camera.position.set(21, 13, 24);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(0, 3, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 70;

    this.scene.backgroundNode = mix(this.skyHorizon, this.skyZenith, smoothstep(-0.05, 0.6, positionWorldDirection.y));

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 18;
    sc.bottom = -18;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.sunMarker = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 16), new THREE.MeshBasicNodeMaterial({ color: 0xffe08a }));
    this.scene.add(this.sunMarker);

    this.buildEnvironment();
    this.scene.add(this.houseGroup);

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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    await renderer.init();
    renderer.domElement.setAttribute('aria-label', 'ภาพ 3 มิติ บ้านติดโซลาร์เซลล์');
    container.prepend(renderer.domElement);
    return new SolarScene(container, renderer);
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private std(hex: number, opts: Partial<THREE.MeshStandardNodeMaterialParameters> = {}): THREE.MeshStandardNodeMaterial {
    return new THREE.MeshStandardNodeMaterial({ color: hex, roughness: 0.85, ...opts });
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true, receive = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  }

  private buildEnvironment(): void {
    const ground = this.mesh(new THREE.CircleGeometry(90, 64), this.std(0x7fae5a), false, true);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // ลูกศรทิศเหนือบนพื้น
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.6);
    shape.lineTo(0.7, -0.6);
    shape.lineTo(0, -0.2);
    shape.lineTo(-0.7, -0.6);
    shape.closePath();
    const arrow = this.mesh(new THREE.ShapeGeometry(shape), this.std(0xd94a3a), false, false);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(-11, 0.03, -9);
    this.scene.add(arrow);

    const trunk = this.std(0x7a5232);
    const leaves = this.std(0x3f7d3a);
    for (const [x, z, s] of [
      [-12, -5, 1.2],
      [-12.5, 4, 1],
      [9, -9.5, 1.3],
      [-5, -12, 1.1],
      [12.5, 2, 0.9],
    ] as const) {
      const t = this.mesh(new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 2.2 * s, 8), trunk);
      t.position.set(x, 1.1 * s, z);
      const c = this.mesh(new THREE.IcosahedronGeometry(1.6 * s, 1), leaves);
      c.position.set(x, 2.9 * s, z);
      this.scene.add(t, c);
    }
  }

  private buildHouse(h: HouseParams): void {
    this.houseGroup.clear();
    const W = h.width;
    const D = h.depth;
    const H = 3 * h.floors;
    const p = (h.pitchDeg * Math.PI) / 180;
    const rise = (D / 2) * Math.tan(p);

    // ถนนหน้าบ้าน (หมุนตามบ้าน)
    const road = this.mesh(new THREE.PlaneGeometry(120, 7), this.std(0x55595f, { roughness: 0.95 }), false, true);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, 17);
    const line = this.mesh(new THREE.PlaneGeometry(120, 0.15), this.std(0xf4f1e8), false, false);
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.02, 17);
    this.houseGroup.add(road, line);

    const base = this.mesh(new THREE.BoxGeometry(W + 1.2, 0.3, D + 1.2), this.std(0xb9b4aa));
    base.position.y = 0.15;
    const walls = this.mesh(new THREE.BoxGeometry(W, H, D), this.std(0xf3e9d8));
    walls.position.y = H / 2 + 0.3;
    this.houseGroup.add(base, walls);

    // หน้าต่าง (เรืองแสงตอนกลางคืน) + ประตู
    const winMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0.2 });
    winMat.colorNode = color(0x27445f);
    winMat.emissiveNode = color(0xffc46b).mul(this.windowGlow);
    for (let f = 0; f < h.floors; f++) {
      const y = 0.3 + f * 3 + 1.7;
      const count = Math.max(2, Math.floor(W / 3));
      for (let i = 0; i < count; i++) {
        const x = -W / 2 + ((i + 0.5) * W) / count;
        if (f === 0 && i === Math.floor(count / 2)) continue;
        for (const side of [1, -1]) {
          const win = this.mesh(new THREE.BoxGeometry(1.3, 1.2, 0.08), winMat, false, false);
          win.position.set(x, y, side * (D / 2 + 0.03));
          this.houseGroup.add(win);
        }
      }
    }
    const door = this.mesh(new THREE.BoxGeometry(1.1, 2.2, 0.1), this.std(0x8a5a36), false, false);
    door.position.set(-W / 2 + (Math.floor(Math.max(2, Math.floor(W / 3)) / 2) + 0.5) * (W / Math.max(2, Math.floor(W / 3))), 1.4, D / 2 + 0.04);
    this.houseGroup.add(door);

    // หลังคาจั่ว 2 ฝั่ง: +Z = ฝั่งติดแผง
    const roofMat = this.std(0xb4553a, { roughness: 0.7 });
    const L = D / 2 / Math.cos(p) + OVERHANG;
    for (const side of [1, -1]) {
      const slab = this.mesh(new THREE.BoxGeometry(W + 0.8, SLAB, L), roofMat);
      const dir = new THREE.Vector3(0, -Math.sin(p), side * Math.cos(p));
      const normal = new THREE.Vector3(0, Math.cos(p), side * Math.sin(p));
      const ridge = new THREE.Vector3(0, 0.3 + H + rise, 0);
      slab.position.copy(ridge).addScaledVector(dir, L / 2).addScaledVector(normal, SLAB / 2);
      slab.rotation.x = side * p;
      this.houseGroup.add(slab);
    }
    const gable = new THREE.BufferGeometry();
    const y0 = 0.3 + H;
    gable.setAttribute('position', new THREE.Float32BufferAttribute([0, y0, -D / 2, 0, y0, D / 2, 0, y0 + rise, 0], 3));
    gable.computeVertexNormals();
    for (const side of [1, -1]) {
      const g = this.mesh(gable, this.std(0xe9dcc4, { side: THREE.DoubleSide }));
      g.position.x = (side * W) / 2;
      this.houseGroup.add(g);
    }
    const ridgeCap = this.mesh(new THREE.BoxGeometry(W + 0.9, 0.18, 0.3), this.std(0x8e3f2b));
    ridgeCap.position.set(0, 0.3 + H + rise + SLAB, 0);
    this.houseGroup.add(ridgeCap);

    // อินเวอร์เตอร์ + มิเตอร์ ที่ผนังด้าน +X, เสาไฟฟ้าริมถนน
    const inv = this.mesh(new THREE.BoxGeometry(0.2, 0.7, 0.5), this.std(0xf7f7f7, { roughness: 0.4 }));
    inv.position.set(W / 2 + 0.12, 1.6, D / 2 - 1.2);
    const meter = this.mesh(new THREE.BoxGeometry(0.18, 0.45, 0.35), this.std(0x9aa3ad, { roughness: 0.5 }));
    meter.position.set(W / 2 + 0.11, 1.8, D / 2 - 2.6);
    const pole = this.mesh(new THREE.CylinderGeometry(0.14, 0.18, 8.5, 10), this.std(0x9c9a94));
    pole.position.set(W / 2 + 4.5, 4.25, 14);
    const arm = this.mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), this.std(0x6b6b6b));
    arm.position.set(W / 2 + 4.5, 8, 14);
    this.houseGroup.add(inv, meter, pole, arm, this.panelGroup);

    // เส้นพลังงาน
    const tube = (pts: THREE.Vector3[], fm: FlowMaterial, r = 0.06) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      this.houseGroup.add(this.mesh(new THREE.TubeGeometry(curve, 64, r, 8, false), fm.material, false, false));
    };
    if (!this.flows) {
      this.flows = {
        pv: createFlowMaterial(0xffb020),
        home: createFlowMaterial(0xffd34d),
        grid: createFlowMaterial(0x3b8beb, 14),
      };
    }
    const eaveY = 0.3 + H + SLAB;
    tube(
      [
        new THREE.Vector3(W / 2 - 0.8, eaveY + 0.15, D / 2 - 0.6),
        new THREE.Vector3(W / 2 + 0.2, eaveY, D / 2 - 0.9),
        new THREE.Vector3(W / 2 + 0.16, 2.6, D / 2 - 1.2),
        new THREE.Vector3(W / 2 + 0.16, 1.95, D / 2 - 1.2),
      ],
      this.flows.pv,
    );
    tube(
      [
        new THREE.Vector3(W / 2 + 0.16, 1.25, D / 2 - 1.2),
        new THREE.Vector3(W / 2 + 0.14, 1.0, D / 2 - 1.9),
        new THREE.Vector3(W / 2 + 0.14, 1.5, D / 2 - 2.6),
      ],
      this.flows.home,
    );
    tube(
      [
        new THREE.Vector3(W / 2 + 4.5, 7.9, 14),
        new THREE.Vector3(W / 2 + 2.5, 6.2, D / 2 + 4),
        new THREE.Vector3(W / 2 + 0.6, 3.4, D / 2 - 2.2),
        new THREE.Vector3(W / 2 + 0.14, 2.05, D / 2 - 2.6),
      ],
      this.flows.grid,
      0.045,
    );

    this.houseGroup.rotation.y = this.bearingToRotation(h.bearingDeg);
    this.controls.target.set(0, (H + rise) / 2 + 0.6, 0);
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
    const H = 3 * h.floors;
    const rise = (h.depth / 2) * Math.tan(p);
    const pw = cap.landscape ? PANEL_LONG : PANEL_SHORT;
    const ph = cap.landscape ? PANEL_SHORT : PANEL_LONG;
    const rows = Math.ceil(n / cap.cols);
    const dir = new THREE.Vector3(0, -Math.sin(p), Math.cos(p));
    const normal = new THREE.Vector3(0, Math.cos(p), Math.sin(p));
    const ridge = new THREE.Vector3(0, 0.3 + H + rise, 0);
    const vStart = (cap.slopeLen - rows * (ph + PANEL_GAP)) / 2;

    const frameGeo = new THREE.BoxGeometry(PANEL_SHORT, 0.045, PANEL_LONG);
    const glassGeo = new THREE.PlaneGeometry(PANEL_SHORT * 0.975, PANEL_LONG * 0.98).rotateX(-Math.PI / 2);
    const frameMat = this.std(0xc9ced6, { metalness: 0.7, roughness: 0.35 });
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cap.cols);
      const inRow = r === rows - 1 ? n - r * cap.cols : cap.cols;
      const c = i % cap.cols;
      const u = (c - (inRow - 1) / 2) * (pw + PANEL_GAP);
      const v = vStart + (r + 0.5) * (ph + PANEL_GAP);
      const panel = new THREE.Group();
      const frame = this.mesh(frameGeo, frameMat);
      const glass = this.mesh(glassGeo, this.panelMat, false, true);
      glass.position.y = 0.024;
      panel.add(frame, glass);
      panel.position.copy(ridge).addScaledVector(dir, v).addScaledVector(normal, SLAB + 0.09);
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
      this.buildHouse(state.house);
      this.panelKey = '';
    }
    const pk = `${hk}|${state.panelCount}`;
    if (pk !== this.panelKey) {
      this.panelKey = pk;
      this.buildPanels(state.house, state.panelCount);
    }
    this.updateSun();
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

  private updateSun(): void {
    if (!this.state) return;
    const pos = sunPosition(this.state.lat, this.state.month, this.state.hour);
    const [x, y, z] = sunDirection(pos);
    const dist = 60;
    this.sun.position.set(x * dist, Math.max(y, 0.02) * dist, z * dist);
    this.sun.target.position.set(0, 0, 0);
    this.sunMarker.position.set(x * 85, y * 85, z * 85);
    this.sunMarker.visible = y > -0.02;
    const day = THREE.MathUtils.smoothstep(y, -0.05, 0.25);
    this.sun.intensity = 3.2 * day;
    this.hemi.intensity = 0.35 + 1.35 * day;
    this.windowGlow.value = 1 - THREE.MathUtils.smoothstep(y, -0.08, 0.1);
    const warm = 1 - THREE.MathUtils.smoothstep(y, 0.02, 0.35);
    this.sun.color.setRGB(1, 0.95 - 0.25 * warm, 0.85 - 0.45 * warm);
    const zen = new THREE.Color(0x0b1430).lerp(new THREE.Color(0x3b82c4), day);
    const hor = new THREE.Color(0x1c2640).lerp(new THREE.Color(0xf6b27a), warm * day).lerp(new THREE.Color(0xcfe6f7), day * (1 - warm));
    this.skyZenith.value.copy(zen);
    this.skyHorizon.value.copy(hor);
  }

  private frame(): void {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    if (this.flows) {
      this.flows.pv.offset.value += this.flowSpeeds.pv * dt * 1.6;
      this.flows.home.offset.value += this.flowSpeeds.home * dt * 1.6;
      this.flows.grid.offset.value += this.flowSpeeds.grid * dt * 1.6;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
