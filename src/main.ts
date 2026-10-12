import './styles.css';
import { PROVINCES } from './data/seed';
import {
  DAYS_IN_MONTH,
  MONTH_NAMES_TH,
  SWEEP_DAY_FRACTIONS,
  SWEEP_SIZES,
  buildContext,
  confidenceLabel,
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
import { hhmm, num, thb } from './ui/format';
import { defaultState, loadState, resetOffers, saveState, shareUrl, type AppState, type TabId } from './ui/state';
import { homeDynamic, monthOptions, renderHome, renderInstallers, renderLearn, renderResults, renderSize, type Model } from './ui/views';

const state: AppState = loadState();
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
  };
  saveState(s);
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
      monthlyLoadFactors: state.assumptions.monthlyLoadFactors,
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
    if (state.tab === 'size') renderTab();
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
      panel.innerHTML = renderResults(state, model);
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
  $('#sum-bill').textContent = a ? `${thb(a.billBefore / 12)} → ${thb(a.billAfter / 12)}` : '–';
  $('#sum-save').textContent = e?.annualNet != null ? `${thb(e.annualNet)}/ปี` : '–';
  $('#sum-payback').textContent = e?.payback != null ? `${num(e.payback, 1)} ปี` : 'ยังคำนวณไม่ได้';
  $('#sum-capex').textContent = e?.capex.capex != null ? thb(e.capex.capex) : 'VAT?';
  const o = e?.offer;
  const name = e?.installer?.name ?? '';
  const over = model.panelCount > model.capacity;
  $('#hud-offer').innerHTML = o
    ? `<b>${name}</b> ${o.packageName}<br><small>${model.panelCount} แผง • ${num(o.solarDcKwp, 2)} kWp DC • อินเวอร์เตอร์ ${num(o.inverterAcKw, 1)} kW</small>${over ? `<div class="hud-warn">หลังคาฝั่งนี้วางได้ ${model.capacity} แผง — ต้องใช้ฝั่งอื่น/ลดขนาด</div>` : ''}`
    : '';
}

function updateScene(): void {
  const e = model.sel;
  const m = state.view.month;
  const h = Math.min(23, Math.floor(state.view.hour));
  const days = DAYS_IN_MONTH[m]!;
  const hm = e?.sim?.hourly[m];
  const pv = hm ? hm.pv[h]! / days : 0;
  const load = (model.ctx.load[m]![h] ?? 0) / days;
  const self = Math.min(pv, load);
  const flows = { pv, self, import: Math.max(0, load - self), export: Math.max(0, pv - self) };
  const peak = hm ? Math.max(...hm.pv) / days : 1;
  const lat = PROVINCES.find((p) => p.name === state.scenario.province)?.lat ?? 13.86;
  scene?.update({ house: state.house, panelCount: model.panelCount, lat, month: m, hour: state.view.hour, flows, flowScale: Math.max(peak, 1) });
  $('#hud-time').textContent = `${hhmm(state.view.hour)} น. • ${MONTH_NAMES_TH[m]}`;
  $('#flow-pv').textContent = `${num(flows.pv, 2)} kW`;
  $('#flow-load').textContent = `${num(load, 2)} kW`;
  $('#flow-self').textContent = `${num(flows.self, 2)} kW`;
  $('#flow-grid').textContent = flows.import > 0.005 ? `ซื้อ ${num(flows.import, 2)} kW` : flows.export > 0.005 ? `เหลือ ${num(flows.export, 2)} kW` : '0 kW';
  $('#flow-grid-row').dataset.dir = flows.import > 0.005 ? 'import' : 'export';
  const hourEl = $<HTMLInputElement>('#hour');
  if (document.activeElement !== hourEl) hourEl.value = String(state.view.hour);
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
  setPath(path, v);
  refresh({ tab: path.startsWith('weights.') ? false : undefined });
});

panel.addEventListener('change', (ev) => {
  const el = ev.target as HTMLSelectElement;
  if (el.dataset.action === 'select-offer') {
    state.selected = el.value;
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
      state.scenario.billMonthlyThb = Number(btn.dataset.value);
      refresh();
      break;
    case 'day':
      state.scenario.dayUseFraction = Number(btn.dataset.value);
      refresh();
      break;
    case 'view-offer':
      state.selected = btn.dataset.id!;
      refresh({ tab: true });
      document.querySelector('.viewport')?.scrollIntoView({ behavior: 'smooth' });
      break;
    case 'custom-size':
      state.selected = `CUSTOM:${btn.dataset.kwp}`;
      refresh({ tab: true });
      document.querySelector('.viewport')?.scrollIntoView({ behavior: 'smooth' });
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
        Object.assign(state, { scenario: d.scenario, assumptions: d.assumptions, house: d.house, autoRoof: true, weights: d.weights });
        refresh({ tab: true });
      }
      break;
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

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    state.tab = b.dataset.tab as TabId;
    panel.scrollTop = 0;
    renderTab();
  }),
);
$('#share').addEventListener('click', share);

/* time / month controls in the 3D viewport */
const hourInput = $<HTMLInputElement>('#hour');
hourInput.addEventListener('input', () => {
  state.view.hour = Number(hourInput.value);
  updateScene();
  if (state.tab === 'results') renderTab();
});
const monthSel = $<HTMLSelectElement>('#month');
monthSel.innerHTML = monthOptions(state.view.month);
monthSel.addEventListener('change', () => {
  state.view.month = Number(monthSel.value);
  updateScene();
  if (state.tab === 'results' || state.tab === 'home') renderTab();
});
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
  } else if (state.tab === 'results') renderTab();
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
    archive(existing);
    state.offers = state.offers.filter((o) => o.id !== existing.id);
    dialog.close();
    refresh({ tab: true });
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const { offer, newInstaller } = readEditor(form, base);
    if (newInstaller) state.installers.push(newInstaller);
    if (existing) {
      archive(existing);
      state.offers = state.offers.map((o) => (o.id === existing.id ? offer : o));
    } else {
      if (state.offers.some((o) => o.id === offer.id)) offer.id += `-${state.offers.length}`;
      state.offers.push(offer);
    }
    state.selected = offer.id;
    dialog.close();
    refresh({ tab: true });
  });
  dialog.showModal();
}

/** เก็บราคาเดิมไว้ ไม่ overwrite จนประวัติหาย */
function archive(o: Offer): void {
  try {
    const key = 'solar3d:offer-history';
    const hist = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
    hist.push({ ...o, archivedAt: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(hist.slice(-200)));
  } catch {
    /* ignore */
  }
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
compute();
renderTab();
renderSummaryBar();
SolarScene.create($('#viewport'))
  .then((s) => {
    scene = s;
    if (s.gpuDevice) useSharedDevice(s.gpuDevice);
    $('#renderer').textContent = s.backendName === 'WebGPU' ? 'WebGPU + WGSL' : 'WebGL2';
    $('#renderer').title = s.backendName === 'WebGPU' ? 'เรนเดอร์ด้วย WebGPU, shader แผงโซลาร์และการคำนวณขนาดเขียนด้วย WGSL' : 'เบราว์เซอร์นี้ไม่รองรับ WebGPU จึงใช้ WebGL2 แทน (ผลคำนวณเหมือนกัน)';
    $('#renderer').classList.add(s.backendName === 'WebGPU' ? 'good' : 'mute');
    $('#viewport').classList.add('ready');
    (window as unknown as { __scene: SolarScene }).__scene = s;
  })
  .catch((err) => {
    console.error(err);
    $('#viewport').classList.add('failed');
    $('#renderer').textContent = 'ไม่รองรับ 3D';
  })
  .finally(() => refresh());
