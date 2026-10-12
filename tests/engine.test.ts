import { describe, expect, it } from 'vitest';
import { DATA_AS_OF, DEFAULT_ASSUMPTIONS, DEFAULT_SCENARIO, INSTALLERS, SEED_OFFERS } from '../src/data/seed';
import {
  LOAD_SHAPES,
  SWEEP_DAY_FRACTIONS,
  SWEEP_SIZES,
  bill,
  buildContext,
  cashflow,
  evaluateOffer,
  getLoadShape,
  hourlyLoadFractions,
  invertBill,
  offerCapex,
  orientationFactor,
  recommend,
  simulate,
  simulateForKwp,
  solarHourlyFractions,
  sweepCPU,
  type Offer,
  type Scenario,
} from '../src/engine';

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const ctxFor = (s: Partial<Scenario> = {}) => buildContext({ ...DEFAULT_SCENARIO, ...s }, DEFAULT_ASSUMPTIONS);
const offer = (id: string) => SEED_OFFERS.find((o) => o.id === id)!;

describe('tariff 1.2 (ก.ย. 2569)', () => {
  it('matches baseline bills', () => {
    expect(bill(300)).toBeCloseTo(1165.39, 1);
    expect(bill(500)).toBeCloseTo(2111.41, 1);
    expect(bill(800)).toBeCloseTo(3562.52, 1);
  });
  it('inverts a bill with the piecewise inverse', () => {
    expect(invertBill(3500)).toBeCloseTo(787.07, 1);
    expect(Math.abs(bill(invertBill(3500)) - 3500)).toBeLessThan(0.05);
    for (const amount of [150, 700, 1500, 3000, 4000, 9000]) {
      expect(Math.abs(bill(invertBill(amount)) - amount)).toBeLessThan(0.05);
    }
  });
  it('never returns negative kWh', () => {
    expect(invertBill(0)).toBe(0);
    expect(invertBill(-100)).toBe(0);
    expect(invertBill(10)).toBe(0);
  });
});

describe('profiles', () => {
  it('load fractions sum to 1 and daytime share equals the input', () => {
    for (const shape of LOAD_SHAPES) {
      for (const f of [0.2, 0.4, 0.6, 0.8]) {
        const lf = hourlyLoadFractions(shape.weights, f);
        expect(sum(lf)).toBeCloseTo(1, 9);
        expect(sum(lf.slice(6, 18))).toBeCloseTo(f, 9);
      }
    }
  });
  it('solar fractions sum to 1 and are zero at night', () => {
    const sf = solarHourlyFractions();
    expect(sum(sf)).toBeCloseTo(1, 9);
    [0, 1, 2, 3, 4, 5, 6, 18, 19, 20, 21, 22, 23].forEach((h) => expect(sf[h]).toBe(0));
  });
  it('orientation factor is 1 facing south and lower facing north', () => {
    expect(orientationFactor(0, 20)).toBeCloseTo(1, 6);
    expect(orientationFactor(180, 25)).toBeLessThan(orientationFactor(90, 25));
    expect(orientationFactor(90, 25)).toBeLessThan(1);
  });
});

describe('hourly simulation invariants', () => {
  const ctx = ctxFor();
  for (const kwp of [0, 1, 3, 4.72, 8, 20]) {
    it(`holds for ${kwp} kWp`, () => {
      const r = simulateForKwp(ctx, kwp);
      const a = r.annual;
      expect(a.selfUseKwh).toBeGreaterThanOrEqual(0);
      expect(a.selfUseKwh).toBeLessThanOrEqual(Math.min(a.pvKwh, a.loadKwh) + 1e-9);
      expect(a.importKwh).toBeGreaterThanOrEqual(0);
      expect(a.importKwh).toBeLessThanOrEqual(a.loadKwh + 1e-9);
      expect(a.exportKwh).toBeCloseTo(a.pvKwh - a.selfUseKwh, 6);
      expect(a.grossSaving).toBeLessThanOrEqual(a.billBefore);
      r.hourly.forEach((hm) => hm.pv.forEach((p) => expect(p).toBeGreaterThanOrEqual(0)));
    });
  }
  it('zero PV gives zero saving', () => {
    expect(simulateForKwp(ctx, 0).annual.grossSaving).toBe(0);
  });
  it('night-only load gives ~0 self-use even with a big array', () => {
    const night = buildContext({ ...DEFAULT_SCENARIO, dayUseFraction: 0 }, DEFAULT_ASSUMPTIONS);
    const r = simulateForKwp(night, 10);
    expect(r.annual.pvKwh).toBeGreaterThan(10_000);
    expect(r.annual.selfUseKwh).toBeCloseTo(0, 6);
  });
  it('80% daytime use is not 80% self-consumption', () => {
    const r = simulateForKwp(ctx, 4.72);
    expect(r.annual.selfUseKwh / r.annual.loadKwh).toBeLessThan(0.8);
  });
});

describe('Excel parity (GR5-SG, 3,500 บาท, 80% กลางวัน)', () => {
  const ctx = ctxFor();
  const e = evaluateOffer(offer('GR5-SG'), ctx, DATA_AS_OF, INSTALLERS);
  it('uses 787 kWh/month', () => expect(ctx.monthlyKwh).toBeCloseTo(787.07, 1));
  it('produces ~6,055 kWh/yr and self-uses ~5,797', () => {
    expect(e.sim!.annual.pvKwh).toBeGreaterThan(6055 * 0.99);
    expect(e.sim!.annual.pvKwh).toBeLessThan(6055 * 1.01);
    expect(e.sim!.annual.selfUseKwh).toBeGreaterThan(5797 * 0.99);
    expect(e.sim!.annual.selfUseKwh).toBeLessThan(5797 * 1.01);
  });
  it('saves ~27,792 THB gross / ~26,292 net, payback ~5.5 y', () => {
    expect(e.annualGross!).toBeGreaterThan(27792 * 0.99);
    expect(e.annualGross!).toBeLessThan(27792 * 1.01);
    expect(e.annualNet!).toBeCloseTo(e.annualGross! - 1500, 6);
    expect(e.payback!).toBeGreaterThan(5.4);
    expect(e.payback!).toBeLessThan(5.6);
  });
  it('uses 4.72 DC kWp (8 × 590 W), not the 5 kW inverter rating', () => {
    expect(e.offer.solarDcKwp).toBeCloseTo((8 * 590) / 1000, 9);
    expect(e.sim!.annual.pvKwh).toBeLessThan(simulateForKwp(ctx, 5).annual.pvKwh);
  });
});

describe('financial', () => {
  it('VAT-excluded and VAT-included quotes give the same all-in capex', () => {
    const incl = offerCapex({ publishedPrice: 107_000, vatMode: 'INCL', siteExtras: 5000 }, 0.07);
    const excl = offerCapex({ publishedPrice: 100_000, vatMode: 'EXCL', siteExtras: 5000 }, 0.07);
    expect(incl.capex).toBeCloseTo(excl.capex!, 6);
  });
  it('unknown VAT has no all-in price', () => {
    expect(offerCapex({ publishedPrice: 110_000, vatMode: 'UNKNOWN', siteExtras: 0 }, 0.07).capex).toBeNull();
  });
  it('tax deduction is off by default', () => {
    expect(DEFAULT_ASSUMPTIONS.taxDeductionEnabled).toBe(false);
    const rows = cashflow(145_000, 27_000, 1500, DEFAULT_ASSUMPTIONS);
    expect(rows.every((r) => r.tax === 0)).toBe(true);
    const withTax = cashflow(145_000, 27_000, 1500, { ...DEFAULT_ASSUMPTIONS, taxDeductionEnabled: true });
    expect(withTax[1]!.tax).toBeCloseTo(145_000 * 0.1, 6);
  });
  it('cashflow has 26 rows and starts at -capex', () => {
    const rows = cashflow(100_000, 20_000, 1000, DEFAULT_ASSUMPTIONS);
    expect(rows).toHaveLength(26);
    expect(rows[0]!.net).toBe(-100_000);
  });
});

describe('recommendation', () => {
  const ctx = ctxFor();
  const rec = recommend(SEED_OFFERS, INSTALLERS, ctx, DATA_AS_OF);
  it('excludes expired promotions and unknown-VAT offers from ranking', () => {
    const ranked = [...rec.confirmed, ...rec.indicative].map((e) => e.offer.id);
    expect(ranked).not.toContain('WS3-OG');
    expect(ranked).not.toContain('SX5-OG');
  });
  it('gives no ROI for battery systems', () => {
    const b = rec.evaluations.find((e) => e.offer.id === 'BATT5')!;
    expect(b.payback).toBeNull();
    expect(b.group).toBe('NOT_RANKED');
  });
  it('has no confirmed winner when no quote is confirmed', () => {
    expect(rec.confirmed).toHaveLength(0);
    expect(rec.topIsConfirmed).toBe(false);
    expect(rec.indicative.length).toBeGreaterThan(0);
  });
  it('promotes a confirmed quote to the confirmed shortlist', () => {
    const offers: Offer[] = SEED_OFFERS.map((o) => (o.id === 'GR3-SG' ? { ...o, evidenceStatus: 'CONFIRMED_QUOTE' } : o));
    const r = recommend(offers, INSTALLERS, ctx, DATA_AS_OF);
    expect(r.confirmed.map((e) => e.offer.id)).toEqual(['GR3-SG']);
    expect(r.top?.offer.id).toBe('GR3-SG');
  });
  it('disqualifies offers that do not fit the roof', () => {
    const small = ctxFor({ roofAreaM2: 20 });
    const e = evaluateOffer(offer('GR5-SG'), small, DATA_AS_OF);
    expect(e.roofFits).toBe(false);
    expect(e.group).toBe('NOT_RANKED');
  });
  it('does not rank when phase mismatches', () => {
    const e = evaluateOffer(offer('GR5-SG'), ctxFor({ phase: 3 }), DATA_AS_OF);
    expect(e.group).toBe('NOT_RANKED');
  });
  it('recomputes when the bill changes', () => {
    const lo = evaluateOffer(offer('GR5-SG'), ctxFor({ billMonthlyThb: 3000 }), DATA_AS_OF);
    const hi = evaluateOffer(offer('GR5-SG'), ctxFor({ billMonthlyThb: 4000 }), DATA_AS_OF);
    expect(hi.annualGross!).toBeGreaterThan(lo.annualGross!);
  });
});

describe('size sweep (CPU reference for the WGSL kernel)', () => {
  it('matches simulate() cell by cell', () => {
    const ctx = ctxFor();
    const out = sweepCPU({
      monthlyKwh: ctx.monthlyKwh,
      loadWeights: getLoadShape(DEFAULT_SCENARIO.loadShape).weights,
      monthlyLoadFactors: DEFAULT_ASSUMPTIONS.monthlyLoadFactors,
      pvPerKwp: ctx.pvPerKwp,
      tariff: ctx.tariff,
      sizes: SWEEP_SIZES,
      dayFractions: SWEEP_DAY_FRACTIONS,
    });
    const d = SWEEP_DAY_FRACTIONS.indexOf(0.8);
    const s = SWEEP_SIZES.indexOf(5);
    const ref = simulate(ctx.load, ctx.pvPerKwp, 5, ctx.tariff);
    const i = d * SWEEP_SIZES.length + s;
    expect(out.grossSaving[i]).toBeCloseTo(ref.annual.grossSaving, 6);
    expect(out.selfUseKwh[i]).toBeCloseTo(ref.annual.selfUseKwh, 6);
  });
});
