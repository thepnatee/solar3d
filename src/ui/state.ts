import { DEFAULT_ASSUMPTIONS, DEFAULT_SCENARIO, INSTALLERS, SEED_OFFERS } from '../data/seed';
import { DEFAULT_WEIGHTS, type Assumptions, type Installer, type Offer, type Scenario, type ScoreWeights } from '../engine';
import type { HouseParams } from '../scene/roof';

export type TabId = 'home' | 'results' | 'daynight' | 'installers' | 'size' | 'learn';

export interface AppMeta {
  /** เคยใช้งานแล้ว (ซ่อนคู่มือเริ่มต้นอัตโนมัติ) */
  visited: boolean;
  /** % กลางวันได้จากการจดเลขมิเตอร์ */
  dayMeasured: boolean;
  /** ผู้ใช้ปรับขนาด/ทิศหลังคาเองแล้ว */
  roofSet: boolean;
  /** ผู้ใช้เลือกแพ็กเกจเอง (ถ้าไม่ ระบบใช้แพ็กเกจที่แนะนำ) */
  pickedOffer: boolean;
}

export interface AppState {
  scenario: Scenario;
  assumptions: Assumptions;
  house: HouseParams;
  autoRoof: boolean;
  offers: Offer[];
  installers: Installer[];
  /** offer id หรือ "CUSTOM:<kWp>" สำหรับขนาดกำหนดเองจากหน้า "ขนาดที่เหมาะ" */
  selected: string;
  weights: ScoreWeights;
  meta: AppMeta;
  view: { month: number; hour: number; playing: boolean; autoRotate: boolean };
  tab: TabId;
}

export const DEFAULT_HOUSE: HouseParams = { width: 10, depth: 8, floors: 2, pitchDeg: 25, bearingDeg: 180 };

export function defaultState(): AppState {
  return {
    scenario: { ...DEFAULT_SCENARIO, monthlyKwh: Array<number | null>(12).fill(null) },
    assumptions: structuredClone(DEFAULT_ASSUMPTIONS),
    house: { ...DEFAULT_HOUSE },
    autoRoof: true,
    offers: structuredClone(SEED_OFFERS),
    installers: structuredClone(INSTALLERS),
    selected: 'GR5-SG',
    weights: { ...DEFAULT_WEIGHTS },
    meta: { visited: false, dayMeasured: false, roofSet: false, pickedOffer: false },
    view: { month: 3, hour: 12, playing: false, autoRotate: false },
    tab: 'home',
  };
}

type Persisted = Pick<AppState, 'scenario' | 'assumptions' | 'house' | 'autoRoof' | 'offers' | 'installers' | 'selected' | 'weights' | 'meta'> & { savedAt: string };
type Shared = Pick<AppState, 'scenario' | 'house' | 'assumptions' | 'autoRoof' | 'selected'>;

/** บันทึกเฉพาะในเบราว์เซอร์เครื่องนี้ (localStorage) — ไม่มีเซิร์ฟเวอร์ ไม่ส่งข้อมูลออกไป */
export const STORAGE_KEY = 'solar-advisor-3d:v2';

function merge(s: AppState, p: Partial<Persisted | Shared>): void {
  if (p.scenario) Object.assign(s.scenario, p.scenario);
  if (!Array.isArray(s.scenario.monthlyKwh) || s.scenario.monthlyKwh.length !== 12) s.scenario.monthlyKwh = Array<number | null>(12).fill(null);
  if (p.assumptions) Object.assign(s.assumptions, p.assumptions);
  if (p.house) Object.assign(s.house, p.house);
  if (typeof p.autoRoof === 'boolean') s.autoRoof = p.autoRoof;
  if (p.selected) s.selected = p.selected;
  if ('offers' in p && Array.isArray(p.offers) && p.offers.length) s.offers = p.offers;
  if ('installers' in p && Array.isArray(p.installers) && p.installers.length) s.installers = p.installers;
  if ('weights' in p && p.weights) Object.assign(s.weights, p.weights);
  if ('meta' in p && p.meta) Object.assign(s.meta, p.meta);
}

export function loadState(): { state: AppState; savedAt: string | null } {
  const s = defaultState();
  let savedAt: string | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>;
      merge(s, p);
      savedAt = p.savedAt ?? null;
    }
  } catch {
    /* storage ใช้ไม่ได้ (เช่นโหมดส่วนตัว) — ใช้ค่าเริ่มต้น */
  }
  // ลิงก์แชร์ (#s=...) มีลำดับความสำคัญกว่าค่าที่บันทึกไว้
  try {
    const m = location.hash.match(/s=([^&]+)/);
    if (m) merge(s, JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]!))))) as Partial<Shared>);
  } catch {
    /* ignore malformed share links */
  }
  return { state: s, savedAt };
}

/** คืนเวลาที่บันทึก หรือ null ถ้าบันทึกไม่ได้ */
export function saveState(s: AppState): string | null {
  try {
    const savedAt = new Date().toISOString();
    const p: Persisted = {
      scenario: s.scenario,
      assumptions: s.assumptions,
      house: s.house,
      autoRoof: s.autoRoof,
      offers: s.offers,
      installers: s.installers,
      selected: s.selected,
      weights: s.weights,
      meta: s.meta,
      savedAt,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    return savedAt;
  } catch {
    return null;
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function shareUrl(s: AppState): string {
  const payload: Shared = { scenario: s.scenario, house: s.house, assumptions: s.assumptions, autoRoof: s.autoRoof, selected: s.selected };
  const enc = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
  return `${location.origin}${location.pathname}#s=${enc}`;
}

export function resetOffers(s: AppState): void {
  s.offers = structuredClone(SEED_OFFERS);
  s.installers = structuredClone(INSTALLERS);
}
