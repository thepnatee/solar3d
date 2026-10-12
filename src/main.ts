// ฟอนต์ไทยฝังมากับแอป (ไม่เรียก Google Fonts → ไม่มีคำขอไปบุคคลที่สาม)
import '@fontsource/ibm-plex-sans-thai/thai-200.css';
import '@fontsource/ibm-plex-sans-thai/thai-400.css';
import '@fontsource/ibm-plex-sans-thai/thai-500.css';
import '@fontsource/ibm-plex-sans-thai/thai-600.css';
import '@fontsource/ibm-plex-sans-thai/thai-700.css';
import '@fontsource/ibm-plex-sans-thai/latin-200.css';
import '@fontsource/ibm-plex-sans-thai/latin-400.css';
import '@fontsource/ibm-plex-sans-thai/latin-600.css';
import './styles.css';
import { PROVINCES } from './data/seed';
import {
  DAYS_IN_MONTH,
  MONTH_NAMES_TH,
  MONTH_SHORT_TH,
  SWEEP_DAY_FRACTIONS,
  SWEEP_SIZES,
  buildContext,
  compareDayFractions,
  confidenceLabel,
  dayFractionFromMeter,
  dayNightSplit,
  estimateCapex,
  evaluateOffer,
  getLoadShape,
  orientationFactor,
  recommend,
  sweepCPU,
  validateInputs,
  type Offer,
  type SweepInput,
  type SweepOutput,
} from './engine';
import { sweep, useSharedDevice } from './gpu/gpu-sweep';
import { SolarScene, panelCapacity, usableRoofArea } from './scene/scene';
import { blankOffer, editorHtml, readEditor } from './ui/editor';
import { esc, hhmm, num, pct, thb } from './ui/format';
import { clearSaved, defaultState, loadState, resetOffers, saveState, shareUrl, type AppState, type TabId } from './ui/state';
import { homeDynamic, renderDayNight, renderHome, renderInstallers, renderLearn, renderResults, renderSize, type Model } from './ui/views';

const loaded = loadState();
const state: AppState = loaded.state;
let model: Model;
let sweepOut: SweepOutput | null = null;
let sweepVerify = '';
let scene: SolarScene | null = null;

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const panel = $('#panel-body');
const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------ path helpers */
function getPath(path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], state);
}
function setPath(path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const target = keys.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, state as unknown as Record<string, unknown>);
  target[last] = value;
}

/* ------------------------------------------------------------ compute */
function customOffer(kwp: number): Offer {
  const base = blankOffer(state.installers);
  return {
    ...base,
    id: `CUSTOM:${kwp}`,
    installerId: '__market',
    packageName: `ขนาด ${kwp} kWp (ราคาตลาดประมาณ)`,
    solarDcKwp: kwp,
    inverterAcKw: Math.round(kwp),
    panelCount: Math.ceil((kwp * 1000) / 590),
    publishedPrice: 0,
    evidenceStatus: 'ESTIMATE',
  };
}

function compute(): void {
  const s = state;
  const prov = PROVINCES.find((p) => p.name === s.scenario.province);
  if (prov) s.scenario.utility = prov.utility;
  const orientation = orientationFactor(s.house.bearingDeg - 180, s.house.pitchDeg);
  if (s.autoRoof) s.scenario.roofAreaM2 = Math.round(usableRoofArea(s.house));
  const assumptions = { ...s.assumptions, orientationFactor: orientation };
  const ctx = buildContext(s.scenario, assumptions);
  const rec = recommend(s.offers, s.installers, ctx, today(), s.weights);

  if (!s.meta.pickedOffer && rec.top) s.selected = rec.top.offer.id;
  let sel = rec.evaluations.find((e) => e.offer.id === s.selected) ?? null;
  const selIsCustom = s.selected.startsWith('CUSTOM:');
  if (selIsCustom) {
    const kwp = Number(s.selected.split(':')[1]);
    const o = customOffer(kwp);
    o.publishedPrice = Math.round(estimateCapex(rec.priceModel, kwp));
    sel = evaluateOffer(o, ctx, today(), s.installers);
    sel.installer = { id: '__market', name: 'ราคาตลาดประมาณ', website: '', serviceArea: '' };
  }
  if (!sel) {
    sel = rec.top ?? rec.evaluations[0] ?? null;
    if (sel) s.selected = sel.offer.id;
  }
  const o = sel?.offer;
  const panelCount = o ? (o.panelCount ?? Math.ceil((o.solarDcKwp * 1000) / (o.panelWatt ?? 590))) : 0;
  model = {
    ctx,
    rec,
    sel,
    selIsCustom,
    confidence: confidenceLabel(s.scenario),
    issues: validateInputs(s.scenario, assumptions),
    roofArea: s.scenario.roofAreaM2,
    orientation,
    panelCount,
    capacity: panelCapacity(s.house).capacity,
    dn: sel?.sim ? dayNightSplit(sel.sim, ctx.tariff) : null,
    shift: sel?.sim
      ? compareDayFractions(s.scenario, assumptions, sel.offer.solarDcKwp, [...new Set([0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, s.scenario.dayUseFraction])])
      : null,
  };
  scheduleSave();
}

/* ------------------------------------------------------------ localStorage (เฉพาะเครื่องนี้) */
let saveTimer = 0;
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => setSaveStatus(saveState(state)), 400);
}
function setSaveStatus(savedAt: string | null): void {
  const el = document.querySelector('#save-text');
  if (!el) return;
  el.textContent = savedAt
    ? `บันทึกในเครื่องนี้ ${new Date(savedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`
    : 'บันทึกไม่ได้ (โหมดส่วนตัว?)';
}

/* ------------------------------------------------------------ GPU sweep (debounced) */
let sweepTimer = 0;
let sweepSeq = 0;
function scheduleSweep(): void {
  clearTimeout(sweepTimer);
  sweepTimer = window.setTimeout(async () => {
    const seq = ++sweepSeq;
    const input: SweepInput = {
      monthlyKwh: model.ctx.monthlyKwh,
      loadWeights: getLoadShape(state.scenario.loadShape).weights,
      monthlyLoadFactors: model.ctx.monthlyLoadFactors,
      pvPerKwp: model.ctx.pvPerKwp,
      tariff: model.ctx.tariff,
      sizes: SWEEP_SIZES,
      dayFractions: SWEEP_DAY_FRACTIONS,
    };
    const out = await sweep(input);
    if (seq !== sweepSeq) return;
    sweepOut = out;
    if (out.backend === 'webgpu-wgsl') {
      // ตรวจผล GPU (f32) เทียบ CPU (f64) ทุกครั้ง
      const ref = sweepCPU(input);
      let maxRel = 0;
      for (let i = 0; i < ref.grossSaving.length; i++) {
        const r = ref.grossSaving[i]!;
        if (r > 1) maxRel = Math.max(maxRel, Math.abs(out.grossSaving[i]! - r) / r);
      }
      sweepVerify = `• ตรวจเทียบ CPU: ต่างสูงสุด ${(maxRel * 100).toFixed(4)}%`;
      (window as unknown as { __sweepCheck: unknown }).__sweepCheck = { backend: out.backend, maxRel };
    } else {
      sweepVerify = '';
    }
    if (state.tab === 'size' || state.tab === 'results') renderTab();
  }, 120);
}

/* ------------------------------------------------------------ rendering */
function syncInputs(): void {
  panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-path]').forEach((el) => {
    if (el === document.activeElement && el instanceof HTMLInputElement && el.type === 'number') return;
    const path = el.dataset.path!;
    const v = getPath(path);
    const scale = Number(el.dataset.scale ?? 1);
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(v);
    else if (el instanceof HTMLInputElement && el.type === 'radio') el.checked = String(v) === el.value;
    else if (el instanceof HTMLInputElement && path === 'scenario.roofAreaM2') {
      el.value = v == null ? '' : String(v);
      el.disabled = state.autoRoof;
    } else el.value = v == null ? '' : String(typeof v === 'number' ? +(v * scale).toFixed(6) : v);
  });
  panel.querySelectorAll<HTMLOutputElement>('output[data-out]').forEach((out) => {
    const v = Number(getPath(out.dataset.out!)) * Number(out.dataset.scale ?? 1);
    out.textContent = `${num(v, v % 1 ? 1 : 0)} ${out.dataset.unit ?? ''}`;
  });
  if (state.tab === 'home') {
    const dyn = homeDynamic(state, model);
    panel.querySelectorAll<HTMLElement>('[data-show]').forEach((el) => {
      el.innerHTML = dyn[el.dataset.show!] ?? '';
    });
  }
  panel.querySelectorAll<HTMLButtonElement>('.chip[data-action="bill"]').forEach((b) => b.classList.toggle('on', Number(b.dataset.value) === state.scenario.billMonthlyThb));
  panel.querySelectorAll<HTMLButtonElement>('.chip[data-action="day"]').forEach((b) => b.classList.toggle('on', Math.abs(Number(b.dataset.value) - state.scenario.dayUseFraction) < 1e-6));
}

function renderTab(): void {
  const scrollTop = panel.scrollTop;
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
  switch (state.tab) {
    case 'home':
      panel.innerHTML = renderHome(state);
      break;
    case 'results':
      panel.innerHTML = renderResults(state, model, sweepOut);
      break;
    case 'daynight':
      panel.innerHTML = renderDayNight(state, model);
      break;
    case 'installers':
      panel.innerHTML = renderInstallers(state, model);
      break;
    case 'size':
      panel.innerHTML = renderSize(state, model, sweepOut, sweepVerify);
      break;
    case 'learn':
      panel.innerHTML = renderLearn();
      break;
  }
  syncInputs();
  panel.scrollTop = scrollTop;
}

function renderSummaryBar(): void {
  const e = model.sel;
  const a = e?.sim?.annual;
  $('#sum-bill').textContent = a ? `${num(a.billBefore / 12)} → ${thb(a.billAfter / 12)}` : '–';
  $('#sum-save').textContent = e?.annualNet != null ? `${thb(e.annualNet)}/ปี` : '–';
  $('#sum-payback').textContent = e?.payback != null ? `${num(e.payback, 1)} ปี` : 'ยังคำนวณไม่ได้';
  $('#sum-capex').textContent = e?.capex.capex != null ? thb(e.capex.capex) : 'VAT?';
  const o = e?.offer;
  const over = model.panelCount > model.capacity;
  $('#live-pkg').innerHTML = o
    ? `<b>${esc(e?.installer?.name ?? '')} ${esc(o.packageName)}</b><span>${model.panelCount} แผง • ${num(o.solarDcKwp, 2)} kWp${e?.payback != null ? ` • คืนทุน ${num(e.payback, 1)} ปี` : ''}</span>${
        over ? `<span class="warn">หลังคาฝั่งนี้วางได้ ${model.capacity} แผง — ต้องใช้ฝั่งอื่นหรือลดขนาด</span>` : ''
      }`
    : '';
  renderMonths();
}

function updateScene(): void {
  const e = model.sel;
  const m = state.view.month;
  const h = Math.min(23, Math.floor(state.view.hour));
  const days = DAYS_IN_MONTH[m]!;
  const hm = e?.sim?.hourly[m];
  // วันเฉลี่ยของเดือน (ค่าเดียวกับที่ใช้คำนวณรายปี)
  const pv = hm ? hm.pv[h]! / days : 0;
  const load = (model.ctx.load[m]![h] ?? 0) / days;
  const self = Math.min(pv, load);
  const flows = { pv, self, import: Math.max(0, load - self), export: Math.max(0, pv - self) };
  const peak = hm ? Math.max(...hm.pv) / days : 1;
  const lat = PROVINCES.find((p) => p.name === state.scenario.province)?.lat ?? 13.86;
  scene?.update({ house: state.house, panelCount: model.panelCount, lat, month: m, hour: state.view.hour, flows, flowScale: Math.max(peak, 1) });

  const isDay = h >= 6 && h < 18;
  $('#hud-time').textContent = `${hhmm(state.view.hour)} น. • ${MONTH_NAMES_TH[m]}`;
  $('#live-when').textContent = `${hhmm(state.view.hour)} น. • ${MONTH_NAMES_TH[m]} (วันเฉลี่ย)`;
  const period = $('#live-period');
  period.textContent = isDay ? '☀️ ช่วงกลางวัน' : '🌙 ช่วงกลางคืน';
  period.className = `badge ${isDay ? 'warn' : 'info'}`;
  $('#live-pv').textContent = num(pv, 2);
  $('#live-load').textContent = num(load, 2);
  $('#live-self').textContent = `${num(self, 2)} kW (${pct(load > 0 ? self / load : 0)})`;
  const exporting = flows.import <= 0.005 && flows.export > 0.005;
  $('#live-grid-label').textContent = exporting ? '↗ ไฟเหลือไหลออก (ไม่มีรายได้)' : '🔌 ซื้อจากการไฟฟ้า';
  $('#live-grid').textContent = `${num(exporting ? flows.export : flows.import, 2)} kW`;
  $('#live-grid-row').dataset.dir = exporting ? 'export' : 'import';
  let note: string;
  if (pv < 0.01) note = 'ไม่มีแดด — ไฟทั้งหมดซื้อจากการไฟฟ้า ส่วนนี้ลดได้ด้วยการย้ายไปใช้กลางวัน หรือแบตเตอรี่';
  else if (exporting) note = 'แผงผลิตเกินที่บ้านใช้ — เหมาะกับการเปิดเครื่องซักผ้า ปั๊มน้ำ หรือชาร์จรถตอนนี้';
  else note = `แผงจ่ายไฟให้บ้าน ${pct(load > 0 ? self / load : 0)} ของที่ใช้อยู่ ส่วนที่เหลือซื้อจากการไฟฟ้า`;
  $('#live-note').textContent = note;
  document.querySelectorAll<HTMLButtonElement>('.quick-times button').forEach((b) => b.classList.toggle('on', Number(b.dataset.hour) === state.view.hour));
  const hourEl = $<HTMLInputElement>('#hour');
  if (document.activeElement !== hourEl) hourEl.value = String(state.view.hour);
}

/** แถบ 12 เดือน: kWh ที่แผงผลิตในแต่ละเดือนของแพ็กเกจที่เลือก */
function renderMonths(): void {
  const sim = model.sel?.sim;
  const max = sim ? Math.max(...sim.months.map((x) => x.pvKwh)) : 1;
  $('#months').innerHTML = MONTH_SHORT_TH.map((n, i) => {
    const kwh = sim ? sim.months[i]!.pvKwh : 0;
    return `<button type="button" class="mo" role="tab" data-month="${i}" aria-selected="${i === state.view.month}" title="${MONTH_NAMES_TH[i]}: ผลิต ~${num(kwh)} kWh, ประหยัด ~${sim ? num(sim.months[i]!.grossSaving) : 0} บาท"><span class="n">${n}</span><span class="bar"><i style="height:${sim ? Math.max(8, (kwh / max) * 100) : 0}%"></i></span><strong>${sim ? num(kwh) : '–'}</strong></button>`;
  }).join('');
}

function refresh(opts: { tab?: boolean } = {}): void {
  compute();
  if (opts.tab ?? state.tab !== 'home') renderTab();
  else syncInputs();
  renderSummaryBar();
  updateScene();
  scheduleSweep();
}

/* ------------------------------------------------------------ events */
panel.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement | HTMLSelectElement;
  if (el.dataset.meter) return meterPreview();
  const path = el.dataset.path;
  if (!path) return;
  const type = el.dataset.type;
  const scale = Number(el.dataset.scale ?? 1);
  let v: unknown;
  if (el instanceof HTMLInputElement && el.type === 'checkbox') v = el.checked;
  else if (type === 'nullable') v = el.value.trim() === '' ? null : Math.max(0, Number(el.value));
  else if (type === 'int') v = parseInt(el.value, 10);
  else if (type === 'float' || el.type === 'range' || el.type === 'number') v = Number(el.value) / scale;
  else v = el.value;
  if (typeof v === 'number' && !Number.isFinite(v)) return;
  if (path === 'scenario.roofAreaM2') state.autoRoof = false;
  if (path.startsWith('house.') || path === 'scenario.roofAreaM2') state.meta.roofSet = true;
  state.meta.visited = true;
  setPath(path, v);
  refresh({ tab: path.startsWith('weights.') ? false : undefined });
});

panel.addEventListener('change', (ev) => {
  const el = ev.target as HTMLSelectElement;
  if (el.dataset.action === 'select-offer') {
    state.selected = el.value;
    state.meta.pickedOffer = true;
    refresh();
  }
  // re-render weights results once the user lets go of the slider
  if (el.dataset.path?.startsWith('weights.')) refresh({ tab: true });
});

panel.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!btn || btn.tagName === 'SELECT') return;
  const a = btn.dataset.action;
  switch (a) {
    case 'bill':
      state.meta.visited = true;
      state.scenario.billMonthlyThb = Number(btn.dataset.value);
      refresh();
      break;
    case 'day':
      state.scenario.dayUseFraction = Number(btn.dataset.value);
      state.meta.dayMeasured = false;
      state.meta.visited = true;
      refresh();
      break;
    case 'view-offer':
      state.selected = btn.dataset.id!;
      state.meta.pickedOffer = true;
      refresh({ tab: true });
      showStageOnMobile();
      break;
    case 'custom-size':
      state.selected = `CUSTOM:${btn.dataset.kwp}`;
      state.meta.pickedOffer = true;
      refresh({ tab: true });
      showStageOnMobile();
      break;
    case 'edit-offer':
      openEditor(state.offers.find((o) => o.id === btn.dataset.id) ?? null);
      break;
    case 'new-offer':
      openEditor(null);
      break;
    case 'reset-offers':
      if (confirm('คืนค่าราคาและบริษัทเป็นข้อมูลตั้งต้น? ใบเสนอราคาที่เพิ่มเองจะหายไป')) {
        resetOffers(state);
        refresh({ tab: true });
      }
      break;
    case 'reset-all':
      if (confirm('รีเซ็ตค่าบ้าน ค่าไฟ และสมมติฐานทั้งหมด?')) {
        const d = defaultState();
        Object.assign(state, { scenario: d.scenario, assumptions: d.assumptions, house: d.house, autoRoof: true, weights: d.weights, meta: { ...d.meta, visited: true } });
        refresh({ tab: true });
      }
      break;
    case 'use-top':
      state.meta.pickedOffer = false;
      refresh({ tab: true });
      break;
    case 'goto':
      gotoTab(btn.dataset.tab as TabId);
      break;
    case 'jump':
      jumpTo(btn.dataset.target!);
      break;
    case 'clear-history':
      state.scenario.monthlyKwh = Array<number | null>(12).fill(null);
      refresh({ tab: true });
      break;
    case 'meter-apply': {
      const f = meterValue();
      if (f != null) {
        state.scenario.dayUseFraction = Math.round(f * 100) / 100;
        state.meta.dayMeasured = true;
        state.meta.visited = true;
        refresh({ tab: true });
        toast(`ตั้งค่าใช้ไฟกลางวัน = ${pct(f)} จากเลขมิเตอร์แล้ว`);
      }
      break;
    }
    case 'csv':
      downloadCsv();
      break;
    case 'print':
      window.print();
      break;
    case 'share':
      share();
      break;
  }
});

function gotoTab(tab: TabId): void {
  state.tab = tab;
  panel.scrollTop = 0;
  renderTab();
  if (window.innerWidth <= 900) $('.tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** เลื่อนไปยังช่องที่ต้องกรอก (สลับไปแท็บกรอกข้อมูลก่อนถ้าจำเป็น) */
function jumpTo(id: string): void {
  if (state.tab !== 'home') {
    state.tab = 'home';
    renderTab();
  }
  const el = document.getElementById(id);
  if (!el) return;
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
  el.querySelector<HTMLElement>('input:not([type=hidden]),select')?.focus({ preventScroll: true });
}

function showStageOnMobile(): void {
  if (window.innerWidth <= 900) $('#stage').scrollIntoView({ behavior: 'smooth' });
}

function meterValue(): number | null {
  const get = (k: string) => Number(panel.querySelector<HTMLInputElement>(`[data-meter="${k}"]`)?.value || NaN);
  return dayFractionFromMeter(get('a'), get('b'), get('c'));
}

function meterPreview(): void {
  const f = meterValue();
  const out = panel.querySelector('#meter-result');
  const btn = panel.querySelector<HTMLButtonElement>('[data-action="meter-apply"]');
  if (out) out.innerHTML = f == null ? 'กรอกครบ 3 ค่า (เลขต้องเพิ่มขึ้นตามเวลา)' : `ใช้ไฟกลางวัน <b>${pct(f)}</b> กลางคืน ${pct(1 - f)}`;
  if (btn) btn.disabled = f == null;
}

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.addEventListener('click', () => gotoTab(b.dataset.tab as TabId)));
$('#clear-data').addEventListener('click', () => {
  if (!confirm('ลบข้อมูลที่บันทึกไว้ในเครื่องนี้ทั้งหมด และเริ่มใหม่?')) return;
  clearSaved();
  const d = defaultState();
  Object.assign(state, { ...d, view: state.view, tab: 'home' as TabId });
  refresh({ tab: true });
  clearTimeout(saveTimer);
  clearSaved();
  $('#save-text').textContent = 'ล้างข้อมูลแล้ว';
  toast('ลบข้อมูลที่บันทึกในเครื่องนี้แล้ว');
});
$('#share').addEventListener('click', share);

/* time / month controls in the 3D viewport */
const hourInput = $<HTMLInputElement>('#hour');
hourInput.addEventListener('input', () => {
  state.view.hour = Number(hourInput.value);
  updateScene();
});
hourInput.addEventListener('change', () => {
  if (state.tab === 'daynight') renderTab();
});
$('#months').addEventListener('click', (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-month]');
  if (!b) return;
  state.view.month = Number(b.dataset.month);
  renderMonths();
  updateScene();
  if (state.tab === 'daynight' || state.tab === 'home') renderTab();
});
document.querySelectorAll<HTMLButtonElement>('.quick-times button').forEach((b) =>
  b.addEventListener('click', () => {
    state.view.hour = Number(b.dataset.hour);
    updateScene();
  }),
);

const autoBtn = $<HTMLButtonElement>('#auto-btn');
autoBtn.addEventListener('click', () => {
  state.view.autoRotate = !state.view.autoRotate;
  scene?.setAutoRotate(state.view.autoRotate);
  autoBtn.setAttribute('aria-pressed', String(state.view.autoRotate));
});
$('#zoom-in').addEventListener('click', () => scene?.zoom(0.85));
$('#zoom-out').addEventListener('click', () => scene?.zoom(1.18));
$('#reset-view').addEventListener('click', () => scene?.resetView());

const playBtn = $<HTMLButtonElement>('#play');
let last = 0;
function playLoop(t: number): void {
  if (!state.view.playing) return;
  const dt = last ? (t - last) / 1000 : 0;
  last = t;
  state.view.hour += dt * 1.5;
  if (state.view.hour >= 19) state.view.hour = 5.5;
  updateScene();
  requestAnimationFrame(playLoop);
}
playBtn.addEventListener('click', () => {
  state.view.playing = !state.view.playing;
  playBtn.textContent = state.view.playing ? '❚❚' : '▶';
  playBtn.setAttribute('aria-label', state.view.playing ? 'หยุด' : 'เล่นทั้งวัน');
  last = 0;
  if (state.view.playing) {
    if (state.view.hour < 5.5 || state.view.hour >= 19) state.view.hour = 5.5;
    requestAnimationFrame(playLoop);
  } else if (state.tab === 'daynight') renderTab();
});

/* ------------------------------------------------------------ offer editor */
const dialog = $<HTMLDialogElement>('#offer-dialog');
function openEditor(existing: Offer | null): void {
  const isNew = !existing;
  const base = existing ?? blankOffer(state.installers);
  dialog.innerHTML = editorHtml(base, state.installers, isNew);
  const form = dialog.querySelector('form')!;
  const instSel = form.querySelector<HTMLSelectElement>('select[name="installerId"]')!;
  const newInst = form.querySelector<HTMLElement>('.new-inst')!;
  instSel.addEventListener('change', () => (newInst.hidden = instSel.value !== '__new'));
  form.querySelector('[data-role="cancel"]')!.addEventListener('click', () => dialog.close());
  form.querySelector('[data-role="delete"]')?.addEventListener('click', () => {
    if (!existing || !confirm(`ลบ ${existing.id}?`)) return;
    state.offers = state.offers.filter((o) => o.id !== existing.id);
    dialog.close();
    refresh({ tab: true });
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const { offer, newInstaller } = readEditor(form, base);
    if (newInstaller) state.installers.push(newInstaller);
    if (existing) {
      state.offers = state.offers.map((o) => (o.id === existing.id ? offer : o));
    } else {
      if (state.offers.some((o) => o.id === offer.id)) offer.id += `-${state.offers.length}`;
      state.offers.push(offer);
    }
    state.selected = offer.id;
    state.meta.pickedOffer = true;
    dialog.close();
    refresh({ tab: true });
  });
  dialog.showModal();
}

/* ------------------------------------------------------------ export / share */
function downloadCsv(): void {
  const rows: (string | number)[][] = [];
  const e = model.sel;
  rows.push(['Solar Advisor 3D', new Date().toISOString()]);
  rows.push(['จังหวัด', state.scenario.province, 'ค่าไฟ/เดือน', state.scenario.billMonthlyThb, 'kWh/เดือน', model.ctx.monthlyKwh.toFixed(1), 'กลางวัน', state.scenario.dayUseFraction]);
  rows.push([]);
  rows.push(['Offer', 'บริษัท', 'ประเภท', 'DC kWp', 'AC kW', 'ราคารวม', 'สถานะ', 'VAT', 'ผลิต kWh/ปี', 'ใช้เอง kWh/ปี', 'ประหยัดขั้นต้น', 'ประหยัดสุทธิ', 'คืนทุน (ปี)', 'NPV', 'กลุ่ม', 'คะแนน', 'เหตุผล']);
  for (const x of model.rec.evaluations) {
    rows.push([
      x.offer.id,
      x.installer?.name ?? '',
      x.offer.systemType,
      x.offer.solarDcKwp,
      x.offer.inverterAcKw,
      x.capex.capex?.toFixed(0) ?? '',
      x.offer.evidenceStatus,
      x.offer.vatMode,
      x.sim?.annual.pvKwh.toFixed(0) ?? '',
      x.sim?.annual.selfUseKwh.toFixed(0) ?? '',
      x.annualGross?.toFixed(0) ?? '',
      x.annualNet?.toFixed(0) ?? '',
      x.payback?.toFixed(2) ?? '',
      x.npv?.toFixed(0) ?? '',
      x.group,
      x.score?.toFixed(1) ?? '',
      x.reasons.join(' | '),
    ]);
  }
  if (e?.sim) {
    rows.push([]);
    rows.push([`รายเดือน: ${e.offer.id}`]);
    rows.push(['เดือน', 'ใช้ไฟ kWh', 'ผลิต kWh', 'ใช้เอง kWh', 'เหลือ kWh', 'ซื้อ kWh', 'บิลก่อน', 'บิลหลัง', 'ประหยัด']);
    for (const mr of e.sim.months)
      rows.push([mr.month, mr.loadKwh, mr.pvKwh, mr.selfUseKwh, mr.exportKwh, mr.importKwh, mr.billBefore, mr.billAfter, mr.grossSaving].map((v) => (typeof v === 'number' ? +v.toFixed(2) : v)));
  }
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `solar-advisor-${today()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function share(): Promise<void> {
  const url = shareUrl(state);
  try {
    await navigator.clipboard.writeText(url);
    toast('คัดลอกลิงก์แล้ว — ส่งให้คนอื่นเปิดดูสถานการณ์เดียวกันได้');
  } catch {
    prompt('คัดลอกลิงก์นี้', url);
  }
}

function toast(msg: string): void {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

/* ------------------------------------------------------------ boot */
// สร้างฉาก 3D ก่อน เพื่อให้ compute shader ใช้ GPUDevice เดียวกับ renderer
if (loaded.savedAt) setSaveStatus(loaded.savedAt);
compute();
renderTab();
renderSummaryBar();
SolarScene.create($('#viewport'))
  .then((s) => {
    scene = s;
    if (s.gpuDevice) useSharedDevice(s.gpuDevice);
    const shift = () => s.setCenterShift(window.innerWidth > 900 ? $('.live-card').getBoundingClientRect().width / 2 + 10 : 0);
    shift();
    window.addEventListener('resize', shift);
    $('#renderer').textContent = s.backendName === 'WebGPU' ? 'WebGPU + WGSL' : 'WebGL2';
    $('#renderer-pill').classList.toggle('fallback', s.backendName !== 'WebGPU');
    $('#renderer-pill').title = s.backendName === 'WebGPU' ? 'เรนเดอร์ด้วย WebGPU, shader แผงโซลาร์และการคำนวณขนาดเขียนด้วย WGSL' : 'เบราว์เซอร์นี้ไม่รองรับ WebGPU จึงใช้ WebGL2 แทน (ผลคำนวณเหมือนกัน)';
    $('#viewport').classList.add('ready');
    (window as unknown as { __scene: SolarScene }).__scene = s;
  })
  .catch((err) => {
    console.error(err);
    $('#viewport').classList.add('failed');
    $('#renderer').textContent = 'ไม่รองรับ 3D';
  })
  .finally(() => refresh());
