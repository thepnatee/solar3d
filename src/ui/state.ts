import { DEFAULT_ASSUMPTIONS, DEFAULT_SCENARIO, INSTALLERS, SEED_OFFERS } from '../data/seed';
import { DEFAULT_WEIGHTS, type Assumptions, type Installer, type Offer, type Scenario, type ScoreWeights } from '../engine';
import type { HouseParams } from '../scene/roof';

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
  view: { month: number; hour: number; playing: boolean };
  tab: TabId;
}

export const DEFAULT_HOUSE: HouseParams = { width: 10, depth: 8, floors: 2, pitchDeg: 25, bearingDeg: 180 };

const STORAGE_KEY = 'solar3d:v1';

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
    view: { month: 3, hour: 12, playing: false },
    tab: 'home',
  };
}

type Persisted = Omit<AppState, 'view' | 'tab'>;

export function loadState(): AppState {
  const s = defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>;
      if (p.scenario) Object.assign(s.scenario, p.scenario);
      if (p.assumptions) Object.assign(s.assumptions, p.assumptions);
      if (p.house) Object.assign(s.house, p.house);
      if (typeof p.autoRoof === 'boolean') s.autoRoof = p.autoRoof;
      if (Array.isArray(p.offers) && p.offers.length) s.offers = p.offers;
      if (Array.isArray(p.installers) && p.installers.length) s.installers = p.installers;
      if (p.selected) s.selected = p.selected;
      if (p.weights) Object.assign(s.weights, p.weights);
    }
  } catch {
    /* storage unavailable — use defaults */
  }
  // ลิงก์แชร์ (#s=...) มีลำดับความสำคัญกว่า localStorage
  try {
    const m = location.hash.match(/s=([^&]+)/);
    if (m) {
      const shared = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]!))))) as Partial<Persisted>;
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

export function saveState(s: AppState): void {
  try {
    const p: Persisted = {
      scenario: s.scenario,
      assumptions: s.assumptions,
      house: s.house,
      autoRoof: s.autoRoof,
      offers: s.offers,
      installers: s.installers,
      selected: s.selected,
      weights: s.weights,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function shareUrl(s: AppState): string {
  const payload = { scenario: s.scenario, house: s.house, assumptions: s.assumptions, autoRoof: s.autoRoof, selected: s.selected };
  const enc = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
  return `${location.origin}${location.pathname}#s=${enc}`;
}

export function resetOffers(s: AppState): void {
  s.offers = structuredClone(SEED_OFFERS);
  s.installers = structuredClone(INSTALLERS);
}
