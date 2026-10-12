import type { EvidenceStatus, SystemType, VatMode } from '../engine';

export const num = (n: number | null | undefined, d = 0): string =>
  n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('th-TH', { maximumFractionDigits: d, minimumFractionDigits: d });
export const thb = (n: number | null | undefined, d = 0): string => (n == null || !Number.isFinite(n) ? '–' : `${num(n, d)} ฿`);
export const pct = (x: number | null | undefined, d = 0): string => (x == null || !Number.isFinite(x) ? '–' : `${num(x * 100, d)}%`);
export const years = (y: number | null | undefined): string => (y == null || !Number.isFinite(y) ? 'ไม่คุ้มทุนภายใต้สมมติฐาน' : `${num(y, 1)} ปี`);

export const esc = (s: string | number | null | undefined): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const EVIDENCE: Record<EvidenceStatus, { label: string; tone: string }> = {
  CONFIRMED_QUOTE: { label: 'ใบเสนอราคายืนยันแล้ว', tone: 'good' },
  PUBLISHED_VERIFY: { label: 'ราคาประกาศ — ขอใบเสนอราคาก่อนซื้อ', tone: 'warn' },
  EXPIRED: { label: 'หมดอายุ', tone: 'mute' },
  ESTIMATE: { label: 'ราคาประมาณ', tone: 'mute' },
};

export const VAT: Record<VatMode, { label: string; tone: string }> = {
  INCL: { label: 'รวม VAT', tone: 'good' },
  EXCL: { label: 'ยังไม่รวม VAT (+7%)', tone: 'info' },
  UNKNOWN: { label: 'VAT ไม่ทราบ', tone: 'bad' },
};

export const SYSTEM: Record<SystemType, string> = {
  ON_GRID: 'On-Grid',
  HYBRID: 'Hybrid + Battery',
  HYBRID_READY: 'Hybrid (ยังไม่มีแบต)',
  OFF_GRID: 'Off-Grid',
};

export const badge = (label: string, tone: string): string => `<span class="badge ${tone}">${esc(label)}</span>`;

export const hhmm = (h: number): string => {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
