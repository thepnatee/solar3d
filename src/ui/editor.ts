import type { EvidenceStatus, Installer, Offer, SystemType, VatMode } from '../engine';
import { EVIDENCE, SYSTEM, VAT, esc } from './format';

const today = () => new Date().toISOString().slice(0, 10);

export function blankOffer(installers: Installer[]): Offer {
  return {
    id: `QUOTE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    installerId: installers[0]?.id ?? 'custom',
    packageName: 'ใบเสนอราคา',
    systemType: 'ON_GRID',
    phase: 1,
    solarDcKwp: 5,
    dcKwpPlaceholder: false,
    inverterAcKw: 5,
    batteryKwh: 0,
    panelWatt: 590,
    panelCount: null,
    panelWarrantyYears: null,
    inverterWarrantyYears: null,
    workWarrantyYears: null,
    publishedPrice: 0,
    vatMode: 'INCL',
    siteExtras: 0,
    annualOandM: 1500,
    evidenceStatus: 'CONFIRMED_QUOTE',
    lastVerifiedAt: today(),
    sourceUrl: '',
  };
}

const sel = <T extends string>(name: string, map: Record<T, string | { label: string }>, cur: T) =>
  `<select name="${name}">${(Object.keys(map) as T[])
    .map((k) => {
      const v = map[k];
      return `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(typeof v === 'string' ? v : v.label)}</option>`;
    })
    .join('')}</select>`;

const n = (v: number | null | undefined) => (v == null ? '' : String(v));

export function editorHtml(o: Offer, installers: Installer[], isNew: boolean): string {
  return `
  <form method="dialog" class="editor">
    <h2>${isNew ? 'เพิ่มใบเสนอราคา' : `แก้ไข ${esc(o.id)}`}</h2>
    <p class="muted small">กรอกตามใบเสนอราคาจริง: ราคา สถานะ VAT จำนวนแผง × วัตต์ (DC kWp) และค่าหน้างาน ระบบจะคำนวณใหม่ทันที • ราคาเก่าถูกเก็บในประวัติของเบราว์เซอร์นี้</p>
    <div class="grid2">
      <label>รหัส <input name="id" required value="${esc(o.id)}" ${isNew ? '' : 'readonly'}></label>
      <label>บริษัท
        <select name="installerId">${installers.map((i) => `<option value="${esc(i.id)}"${i.id === o.installerId ? ' selected' : ''}>${esc(i.name)}</option>`).join('')}<option value="__new">+ บริษัทใหม่…</option></select>
      </label>
      <label class="new-inst" hidden>ชื่อบริษัทใหม่ <input name="newInstaller" placeholder="เช่น บริษัท ก."></label>
      <label>ชื่อแพ็กเกจ <input name="packageName" value="${esc(o.packageName)}"></label>
      <label>ประเภทระบบ ${sel<SystemType>('systemType', SYSTEM, o.systemType)}</label>
      <label>เฟส <select name="phase"><option value="1"${o.phase === 1 ? ' selected' : ''}>1 เฟส</option><option value="3"${o.phase === 3 ? ' selected' : ''}>3 เฟส</option></select></label>
      <label>วัตต์ต่อแผง (W) <input name="panelWatt" type="number" min="0" value="${n(o.panelWatt)}"></label>
      <label>จำนวนแผง <input name="panelCount" type="number" min="0" value="${n(o.panelCount)}"></label>
      <label>DC kWp <small>(คำนวณจากแผงถ้ากรอกครบ)</small> <input name="solarDcKwp" type="number" step="0.01" min="0" value="${n(o.solarDcKwp)}"></label>
      <label>อินเวอร์เตอร์ AC kW <input name="inverterAcKw" type="number" step="0.1" min="0" value="${n(o.inverterAcKw)}"></label>
      <label>ราคาตามใบเสนอ (บาท) <input name="publishedPrice" type="number" min="0" step="100" value="${n(o.publishedPrice)}"></label>
      <label>VAT ${sel<VatMode>('vatMode', VAT, o.vatMode)}</label>
      <label>ค่างานหน้างานเพิ่ม (บาท) <input name="siteExtras" type="number" min="0" step="100" value="${n(o.siteExtras)}"></label>
      <label>ค่าดูแลรักษา/ปี (บาท) <input name="annualOandM" type="number" min="0" step="100" value="${n(o.annualOandM)}"></label>
      <label>สถานะหลักฐาน ${sel<EvidenceStatus>('evidenceStatus', EVIDENCE, o.evidenceStatus)}</label>
      <label>ราคาใช้ได้ถึง <input name="validTo" type="date" value="${esc(o.validTo ?? '')}"></label>
      <label>ประกันอินเวอร์เตอร์ (ปี) <input name="inverterWarrantyYears" type="number" min="0" value="${n(o.inverterWarrantyYears)}"></label>
      <label>ประกันงานติดตั้ง (ปี) <input name="workWarrantyYears" type="number" min="0" value="${n(o.workWarrantyYears)}"></label>
      <label>ประกันแผง (ปี) <input name="panelWarrantyYears" type="number" min="0" value="${n(o.panelWarrantyYears)}"></label>
      <label>ลิงก์/ที่มา <input name="sourceUrl" type="url" value="${esc(o.sourceUrl)}" placeholder="https://"></label>
    </div>
    <label>หมายเหตุโปรโมชั่น <input name="promotionText" value="${esc(o.promotionText ?? '')}"></label>
    <div class="row gap end">
      ${isNew ? '' : '<button type="button" class="btn ghost danger" value="delete" data-role="delete">ลบ</button>'}
      <button type="button" class="btn ghost" data-role="cancel">ยกเลิก</button>
      <button type="submit" class="btn" value="save">บันทึก & คำนวณใหม่</button>
    </div>
  </form>`;
}

const numOrNull = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};

export function readEditor(form: HTMLFormElement, prev: Offer): { offer: Offer; newInstaller?: Installer } {
  const f = new FormData(form);
  let newInstaller: Installer | undefined;
  let installerId = String(f.get('installerId'));
  if (installerId === '__new') {
    const name = String(f.get('newInstaller') || 'บริษัทใหม่').trim();
    installerId = `custom-${Date.now().toString(36)}`;
    newInstaller = { id: installerId, name, website: String(f.get('sourceUrl') ?? ''), serviceArea: 'ต้องสอบถาม' };
  }
  const panelWatt = numOrNull(f.get('panelWatt'));
  const panelCount = numOrNull(f.get('panelCount'));
  let solarDcKwp = Math.max(0, numOrNull(f.get('solarDcKwp')) ?? 0);
  let dcKwpPlaceholder = prev.dcKwpPlaceholder;
  if (panelWatt && panelCount) {
    solarDcKwp = (panelWatt * panelCount) / 1000;
    dcKwpPlaceholder = false;
  } else if (solarDcKwp !== prev.solarDcKwp) {
    dcKwpPlaceholder = false;
  }
  const validTo = String(f.get('validTo') ?? '').trim();
  const offer: Offer = {
    ...prev,
    id: String(f.get('id')).trim() || prev.id,
    installerId,
    packageName: String(f.get('packageName') ?? ''),
    systemType: String(f.get('systemType')) as SystemType,
    phase: Number(f.get('phase')) === 3 ? 3 : 1,
    panelWatt,
    panelCount,
    solarDcKwp,
    dcKwpPlaceholder,
    inverterAcKw: Math.max(0, numOrNull(f.get('inverterAcKw')) ?? 0),
    publishedPrice: Math.max(0, numOrNull(f.get('publishedPrice')) ?? 0),
    vatMode: String(f.get('vatMode')) as VatMode,
    siteExtras: Math.max(0, numOrNull(f.get('siteExtras')) ?? 0),
    annualOandM: Math.max(0, numOrNull(f.get('annualOandM')) ?? 0),
    evidenceStatus: String(f.get('evidenceStatus')) as EvidenceStatus,
    validTo: validTo || undefined,
    inverterWarrantyYears: numOrNull(f.get('inverterWarrantyYears')),
    workWarrantyYears: numOrNull(f.get('workWarrantyYears')),
    panelWarrantyYears: numOrNull(f.get('panelWarrantyYears')),
    sourceUrl: String(f.get('sourceUrl') ?? ''),
    promotionText: String(f.get('promotionText') ?? '') || undefined,
    lastVerifiedAt: today(),
  };
  return { offer, newInstaller };
}
