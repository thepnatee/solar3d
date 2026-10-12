import { DEFAULT_ASSUMPTIONS, DEFAULT_SCENARIO, INSTALLERS, SEED_OFFERS } from '../data/seed';
import { DEFAULT_WEIGHTS, type Assumptions, type Installer, type Offer, type Scenario, type ScoreWeights } from '../engine';
import type { HouseParams } from '../scene/roof';
import { MONTH_WEATHER, type WeatherId } from '../scene/weather-model';

export type TabId = 'home' | 'results' | 'installers' | 'size' | 'learn';

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
  view: { month: number; hour: number; playing: boolean; weather: WeatherId; autoRotate: boolean };
  tab: TabId;
}

export const DEFAULT_HOUSE: HouseParams = { width: 10, depth: 8, floors: 2, pitchDeg: 25, bearingDeg: 180 };

export function defaultState(): AppState {
  return {
    scenario: { ...DEFAULT_SCENARIO },
    assumptions: structuredClone(DEFAULT_ASSUMPTIONS),
    house: { ...DEFAULT_HOUSE },
    autoRoof: true,
    offers: structuredClone(SEED_OFFERS),
    installers: structuredClone(INSTALLERS),
    selected: 'GR5-SG',
    weights: { ...DEFAULT_WEIGHTS },
    view: { month: 3, hour: 12, playing: false, weather: MONTH_WEATHER[3]!, autoRotate: false },
    tab: 'home',
  };
}

type Shared = Pick<AppState, 'scenario' | 'house' | 'assumptions' | 'autoRoof' | 'selected'>;

/**
 * แอปนี้ไม่เก็บข้อมูลใด ๆ (ไม่มี localStorage / cookie / server) — ทุกอย่างอยู่ในหน่วยความจำของแท็บนี้
 * ยกเว้นลิงก์แชร์ (#s=...) ที่ผู้ใช้กดคัดลอกเอง ซึ่งเก็บค่าที่กรอกไว้ใน URL
 */
export function loadState(): AppState {
  const s = defaultState();
  try {
    const m = location.hash.match(/s=([^&]+)/);
    if (m) {
      const shared = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]!))))) as Partial<Shared>;
      if (shared.scenario) Object.assign(s.scenario, shared.scenario);
      if (shared.house) Object.assign(s.house, shared.house);
      if (shared.assumptions) Object.assign(s.assumptions, shared.assumptions);
      if (typeof shared.autoRoof === 'boolean') s.autoRoof = shared.autoRoof;
      if (shared.selected) s.selected = shared.selected;
    }
  } catch {
    /* ignore malformed share links */
  }
  return s;
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
