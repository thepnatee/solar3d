import { breakEvenYear, cashflow, estimateCapex, fitPriceModel, npv, offerCapex, simplePayback, type CapexInfo, type PriceModel } from './financial';
import { pvPerKwpMatrix, simulate, simulateForKwp, type SimulationContext } from './simulate';
import type { CashflowRow, Installer, Offer, ScoreWeights, SimulationResult } from './types';

export const DEFAULT_OANDM = 1500;

export const DEFAULT_WEIGHTS: ScoreWeights = { financial: 40, selfUse: 20, pricePerKwp: 15, warranty: 15, dataConfidence: 10 };

export type RankGroup = 'CONFIRMED' | 'INDICATIVE' | 'NOT_RANKED';

export interface OfferEvaluation {
  offer: Offer;
  installer?: Installer;
  computable: boolean;
  sim: SimulationResult | null;
  capex: CapexInfo;
  annualGross: number | null;
  annualNet: number | null;
  payback: number | null;
  paybackRange: { best: number | null; worst: number | null };
  npv: number | null;
  breakEven: number | null;
  cashflow: CashflowRow[] | null;
  pricePerKwp: number | null;
  selfUseRatio: number | null;
  roofAreaNeeded: number;
  roofFits: boolean | null;
  phaseMatch: boolean | null;
  expired: boolean;
  group: RankGroup;
  reasons: string[];
  warnings: string[];
  explain: string[];
  score: number | null;
  scoreParts: Record<keyof ScoreWeights, number> | null;
}

export interface Recommendation {
  evaluations: OfferEvaluation[];
  confirmed: OfferEvaluation[];
  indicative: OfferEvaluation[];
  notRanked: OfferEvaluation[];
  top: OfferEvaluation | null;
  topIsConfirmed: boolean;
  priceModel: PriceModel;
  insights: string[];
  checklist: string[];
}

const fmt = (n: number, d = 0) => n.toLocaleString('th-TH', { maximumFractionDigits: d, minimumFractionDigits: d });

export function isExpired(o: Offer, today: string): boolean {
  return o.evidenceStatus === 'EXPIRED' || (!!o.validTo && o.validTo < today);
}

function warrantyScore(o: Offer): number {
  const parts = [
    o.inverterWarrantyYears != null ? Math.min(1, o.inverterWarrantyYears / 10) : 0,
    o.workWarrantyYears != null ? Math.min(1, o.workWarrantyYears / 5) : 0,
    o.panelWarrantyYears != null ? Math.min(1, o.panelWarrantyYears / 12) : 0,
  ];
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function dataConfidenceScore(o: Offer): number {
  const base = o.evidenceStatus === 'CONFIRMED_QUOTE' ? 1 : o.evidenceStatus === 'PUBLISHED_VERIFY' ? 0.5 : 0.1;
  return Math.max(0, base - (o.dcKwpPlaceholder ? 0.2 : 0));
}

export function evaluateOffer(o: Offer, ctx: SimulationContext, today: string, installers: Installer[] = []): OfferEvaluation {
  const { scenario: s, assumptions: a, tariff } = ctx;
  const capex = offerCapex(o, tariff.vatRate);
  const warnings: string[] = [];
  const reasons: string[] = [];
  const explain: string[] = [];
  const expired = isExpired(o, today);
  const roofAreaNeeded = o.solarDcKwp * a.areaPerKwp;
  const roofFits = s.roofAreaM2 == null ? null : roofAreaNeeded <= s.roofAreaM2;
  const phaseMatch = s.phase === 0 ? null : s.phase === o.phase;
  const computable = o.systemType === 'ON_GRID' && o.solarDcKwp > 0;

  let sim: SimulationResult | null = null;
  let annualGross: number | null = null;
  let annualNet: number | null = null;
  let payback: number | null = null;
  let rows: CashflowRow[] | null = null;
  let npvValue: number | null = null;
  let breakEven: number | null = null;
  const paybackRange = { best: null as number | null, worst: null as number | null };

  if (o.systemType !== 'ON_GRID') {
    reasons.push('ระบบ Hybrid/แบตเตอรี่ต้องจำลองการชาร์จ-คายประจุ (Advanced simulation required) — ไม่ใช้สูตร ROI แบบ On-grid');
  } else if (!(o.solarDcKwp > 0)) {
    reasons.push('ไม่มีขนาดแผง DC kWp');
  } else {
    sim = simulateForKwp(ctx, o.solarDcKwp);
    annualGross = sim.annual.grossSaving;
    annualNet = annualGross - o.annualOandM;
    payback = simplePayback(capex.capex, annualNet);
    if (capex.capex != null) {
      rows = cashflow(capex.capex, annualGross, o.annualOandM, a);
      npvValue = npv(rows);
      breakEven = breakEvenYear(rows);
      for (const [key, sun] of [['worst', 0.8], ['best', 1.1]] as const) {
        const alt = simulate(ctx.load, pvPerKwpMatrix(a, sun), o.solarDcKwp, tariff);
        paybackRange[key] = simplePayback(capex.capex, alt.annual.grossSaving - o.annualOandM);
      }
    }
    const selfPct = sim.annual.pvKwh > 0 ? (sim.annual.selfUseKwh / sim.annual.pvKwh) * 100 : 0;
    explain.push(
      `ผลิตไฟ ~${fmt(sim.annual.pvKwh)} kWh/ปี ใช้เองได้ ${fmt(selfPct)}% ลดค่าไฟ ~${fmt(annualGross)} บาท/ปี (ก่อนหักค่าดูแล ${fmt(o.annualOandM)} บาท)`,
    );
    if (payback != null) explain.push(`คืนทุนแบบง่าย ~${fmt(payback, 1)} ปี (ช่วงแดดดี-แย่ ${fmt(paybackRange.best ?? payback, 1)}–${paybackRange.worst != null ? fmt(paybackRange.worst, 1) : '>25'} ปี)`);
  }

  if (o.vatMode === 'UNKNOWN') reasons.push('ยังไม่ทราบว่าราคารวม VAT หรือไม่ — ห้ามเทียบเป็นราคา All-in');
  if (!(o.publishedPrice > 0)) reasons.push('ยังไม่มีราคา');
  if (expired) reasons.push('โปรโมชั่น/ราคาหมดอายุแล้ว — เก็บไว้เป็นข้อมูลอ้างอิงเท่านั้น');
  if (phaseMatch === false) reasons.push(`แพ็กเกจนี้สำหรับไฟ ${o.phase} เฟส ไม่ตรงกับบ้าน (${s.phase} เฟส)`);
  if (phaseMatch === null) reasons.push('ยังไม่ทราบว่าบ้านเป็นไฟ 1 หรือ 3 เฟส');
  if (roofFits === false) reasons.push(`หลังคาไม่พอ: ต้องการ ~${fmt(roofAreaNeeded)} ตร.ม. แต่มี ${fmt(s.roofAreaM2 ?? 0)} ตร.ม.`);
  if (o.evidenceStatus === 'ESTIMATE') reasons.push('เป็นราคาประมาณ ไม่ใช่ราคาจากผู้ขาย');
  if (annualNet != null && annualNet <= 0) reasons.push('ไม่คุ้มค่าภายใต้สมมติฐานนี้ (Not viable under assumptions)');

  if (roofFits === null) warnings.push('ยังไม่ทราบพื้นที่หลังคา — ความมั่นใจต่ำจนกว่าจะสำรวจ');
  if (o.dcKwpPlaceholder) warnings.push('DC kWp ยังไม่ยืนยัน (ใช้ค่าเท่าขนาดอินเวอร์เตอร์ชั่วคราว) — ขอจำนวนแผง × วัตต์จริง');
  if (o.evidenceStatus === 'PUBLISHED_VERIFY') warnings.push('ราคาประกาศ — ขอใบเสนอราคาก่อนซื้อ');
  if (Math.abs(o.solarDcKwp - o.inverterAcKw) / Math.max(o.inverterAcKw, 0.1) > 0.25 && o.solarDcKwp > 0)
    warnings.push(`DC ${fmt(o.solarDcKwp, 2)} kWp ต่างจากอินเวอร์เตอร์ ${fmt(o.inverterAcKw, 1)} kW มาก — ตรวจ DC/AC ratio`);

  let group: RankGroup = 'NOT_RANKED';
  if (reasons.length === 0 && payback != null) {
    if (o.evidenceStatus === 'CONFIRMED_QUOTE' && !o.dcKwpPlaceholder) group = 'CONFIRMED';
    else if (o.evidenceStatus === 'CONFIRMED_QUOTE' || o.evidenceStatus === 'PUBLISHED_VERIFY') group = 'INDICATIVE';
  }

  return {
    offer: o,
    installer: installers.find((i) => i.id === o.installerId),
    computable,
    sim,
    capex,
    annualGross,
    annualNet,
    payback,
    paybackRange,
    npv: npvValue,
    breakEven,
    cashflow: rows,
    pricePerKwp: capex.capex != null && o.solarDcKwp > 0 ? capex.capex / o.solarDcKwp : null,
    selfUseRatio: sim && sim.annual.pvKwh > 0 ? sim.annual.selfUseKwh / sim.annual.pvKwh : null,
    roofAreaNeeded,
    roofFits,
    phaseMatch,
    expired,
    group,
    reasons,
    warnings,
    explain,
    score: null,
    scoreParts: null,
  };
}

function scoreAll(list: OfferEvaluation[], w: ScoreWeights): void {
  if (list.length === 0) return;
  const ratio = (e: OfferEvaluation) => (e.annualNet ?? 0) / (e.capex.capex ?? Infinity);
  const maxRatio = Math.max(...list.map(ratio));
  const minPpk = Math.min(...list.map((e) => e.pricePerKwp ?? Infinity));
  const wSum = w.financial + w.selfUse + w.pricePerKwp + w.warranty + w.dataConfidence || 1;
  for (const e of list) {
    const parts = {
      financial: maxRatio > 0 ? Math.max(0, ratio(e) / maxRatio) : 0,
      selfUse: e.selfUseRatio ?? 0,
      pricePerKwp: e.pricePerKwp ? minPpk / e.pricePerKwp : 0,
      warranty: warrantyScore(e.offer),
      dataConfidence: dataConfidenceScore(e.offer),
    };
    e.scoreParts = parts;
    e.score =
      (100 *
        (parts.financial * w.financial +
          parts.selfUse * w.selfUse +
          parts.pricePerKwp * w.pricePerKwp +
          parts.warranty * w.warranty +
          parts.dataConfidence * w.dataConfidence)) /
      wSum;
  }
}

export function recommend(
  offers: Offer[],
  installers: Installer[],
  ctx: SimulationContext,
  today: string,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): Recommendation {
  const evaluations = offers.map((o) => evaluateOffer(o, ctx, today, installers));
  const ranked = evaluations.filter((e) => e.group !== 'NOT_RANKED');
  scoreAll(ranked, weights);
  const byScore = (a: OfferEvaluation, b: OfferEvaluation) => (b.score ?? 0) - (a.score ?? 0);
  const confirmed = evaluations.filter((e) => e.group === 'CONFIRMED').sort(byScore);
  const indicative = evaluations.filter((e) => e.group === 'INDICATIVE').sort(byScore);
  const notRanked = evaluations.filter((e) => e.group === 'NOT_RANKED');
  const top = confirmed[0] ?? indicative[0] ?? null;

  const priceModel = fitPriceModel(
    evaluations
      .filter((e) => e.offer.systemType === 'ON_GRID' && e.capex.capex != null && !e.offer.dcKwpPlaceholder)
      .map((e) => ({ kwp: e.offer.solarDcKwp, capex: e.capex.capex! })),
  );

  return {
    evaluations,
    confirmed,
    indicative,
    notRanked,
    top,
    topIsConfirmed: confirmed.length > 0,
    priceModel,
    insights: buildInsights(ctx, ranked, priceModel),
    checklist: buildChecklist(ctx, evaluations),
  };
}

function buildInsights(ctx: SimulationContext, ranked: OfferEvaluation[], pm: PriceModel): string[] {
  const out: string[] = [];
  const { scenario: s, assumptions: a } = ctx;
  const dayPct = s.dayUseFraction * 100;

  // ขนาดเล็ก vs ใหญ่ จากแพ็กเกจจริง
  const small = ranked.filter((e) => e.offer.solarDcKwp < 4).sort((x, y) => (x.payback ?? 99) - (y.payback ?? 99))[0];
  const large = ranked.filter((e) => e.offer.solarDcKwp >= 4).sort((x, y) => (x.payback ?? 99) - (y.payback ?? 99))[0];
  if (small && large && small.payback != null && large.payback != null) {
    const bigger = large.payback <= small.payback ? large : small;
    const other = bigger === large ? small : large;
    const why =
      bigger === large
        ? `เพราะบ้านใช้ไฟกลางวัน ~${fmt(dayPct)}% ช่วงที่แผงผลิตสูง ไฟจากแผงเกือบทั้งหมดถูกใช้เอง (${fmt((large.selfUseRatio ?? 0) * 100)}%)${large.roofFits ? ' และมีพื้นที่หลังคาเพียงพอ' : ''}`
        : `เพราะระบบใหญ่ผลิตไฟเกินช่วงที่บ้านใช้ ใช้เองได้เพียง ${fmt((large.selfUseRatio ?? 0) * 100)}% ส่วนเกินไม่มีรายได้`;
    out.push(
      `ขนาด ~${fmt(bigger.offer.solarDcKwp, 1)} kWp (${bigger.offer.id}) คืนทุนเร็วกว่าขนาด ~${fmt(other.offer.solarDcKwp, 1)} kWp (${other.offer.id}) ในสถานการณ์นี้ (${fmt(bigger.payback!, 1)} vs ${fmt(other.payback!, 1)} ปี) ${why}`,
    );
  }

  // ทำไมไม่แนะนำ 8/10 kW
  for (const kwp of [8, 10]) {
    const sim = simulateForKwp(ctx, kwp);
    const capex = estimateCapex(pm, kwp);
    const net = sim.annual.grossSaving - DEFAULT_OANDM;
    const pb = simplePayback(capex, net);
    const excess = sim.annual.pvKwh > 0 ? sim.annual.exportKwh / sim.annual.pvKwh : 0;
    const area = kwp * a.areaPerKwp;
    const parts = [`ไฟเกินที่ไม่ได้ใช้ ${fmt(excess * 100)}% (คิดรายได้ 0 บาท)`];
    if (pb != null) parts.push(`คืนทุน ~${fmt(pb, 1)} ปี ที่ราคาตลาดประมาณ ${fmt(capex)} บาท`);
    if (s.roofAreaM2 != null && area > s.roofAreaM2) parts.push(`ต้องใช้หลังคา ~${fmt(area)} ตร.ม. เกินที่มี`);
    out.push(`${kwp} kWp: ${parts.join(', ')}`);
  }

  const ref = ranked[0]?.sim;
  if (ref) {
    const coverage = ref.annual.loadKwh > 0 ? (ref.annual.selfUseKwh / ref.annual.loadKwh) * 100 : 0;
    out.push(
      `ใช้ไฟกลางวัน ${fmt(dayPct)}% ไม่ได้แปลว่าใช้ไฟจากโซลาร์ได้ ${fmt(dayPct)}% — ด้วยแพ็กเกจอันดับแรก ไฟจากแผงแทนไฟการไฟฟ้าได้ ~${fmt(coverage)}% ของการใช้ไฟทั้งปี ที่เหลือยังต้องซื้อ (ตอนเช้าตรู่/เย็น/กลางคืน)`,
    );
  }
  return out;
}

function buildChecklist(ctx: SimulationContext, evals: OfferEvaluation[]): string[] {
  const list: string[] = [];
  const s = ctx.scenario;
  if (s.billedKwh == null) list.push('อ่านจำนวนหน่วย (kWh) จากบิลจริง 12 เดือน แทนการคำนวณย้อนจากยอดเงิน');
  if (s.phase === 0) list.push('ตรวจมิเตอร์ว่าเป็นไฟ 1 เฟส หรือ 3 เฟส');
  if (!s.roofSurveyed) list.push('ให้ช่าง/วิศวกรสำรวจหลังคา ทิศ เงา และความแข็งแรงโครงสร้าง');
  if (evals.some((e) => e.offer.vatMode === 'UNKNOWN')) list.push('ถามผู้ขายว่าราคารวม VAT แล้วหรือยัง');
  if (evals.some((e) => e.offer.dcKwpPlaceholder)) list.push('ขอจำนวนแผง × วัตต์ต่อแผง (DC kWp จริง) และรุ่นอินเวอร์เตอร์ (AC kW)');
  list.push('ราคารวมค่าขออนุญาตเชื่อมต่อการไฟฟ้า เบรกเกอร์ SPD สายดิน และงานหน้างานแล้วหรือยัง');
  list.push('ประกันอินเวอร์เตอร์ / แผง / งานติดตั้งและรั่วซึม กี่ปี และค่าล้างแผงหลังหมดประกัน');
  list.push('ใครยื่นเรื่องกับ MEA/PEA และออก e-Tax Invoice (ถ้าจะใช้สิทธิลดหย่อนภาษี)');
  list.push('ระบบ On-grid ไฟดับจะไม่จ่ายไฟ (anti-islanding) — ถ้าต้องการไฟสำรองต้องคุยเรื่อง Hybrid + Backup');
  return list;
}
