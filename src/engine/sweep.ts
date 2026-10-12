import { HOURS, MONTHS, hourlyLoadFractions } from './profiles';
import { bill } from './tariff';
import type { TariffVersion } from './types';

/**
 * Size × daytime-use sweep — the CPU reference for the WGSL compute shader in src/gpu/.
 * For every (dayFraction, kWp) pair it runs the same hourly matching + tiered bill as simulate().
 */
export interface SweepInput {
  monthlyKwh: number;
  loadWeights: number[];
  monthlyLoadFactors: number[];
  /** [month][hour] kWh per kWp */
  pvPerKwp: number[][];
  tariff: TariffVersion;
  sizes: number[];
  dayFractions: number[];
}

export interface SweepOutput {
  sizes: number[];
  dayFractions: number[];
  /** index = d * sizes.length + s */
  grossSaving: Float64Array;
  pvKwh: Float64Array;
  selfUseKwh: Float64Array;
  backend: 'webgpu-wgsl' | 'cpu';
  ms: number;
}

export const SWEEP_SIZES = Array.from({ length: 19 }, (_, i) => 1 + i * 0.5); // 1 … 10 kWp
export const SWEEP_DAY_FRACTIONS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

export function sweepCPU(input: SweepInput): SweepOutput {
  const t0 = performance.now();
  const { sizes, dayFractions } = input;
  const n = sizes.length * dayFractions.length;
  const grossSaving = new Float64Array(n);
  const pvKwh = new Float64Array(n);
  const selfUseKwh = new Float64Array(n);
  dayFractions.forEach((df, d) => {
    const frac = hourlyLoadFractions(input.loadWeights, df);
    sizes.forEach((kwp, s) => {
      let gross = 0;
      let pv = 0;
      let self = 0;
      for (let m = 0; m < MONTHS; m++) {
        const monthLoad = input.monthlyKwh * input.monthlyLoadFactors[m]!;
        let mSelf = 0;
        for (let h = 0; h < HOURS; h++) {
          const l = monthLoad * frac[h]!;
          const p = input.pvPerKwp[m]![h]! * kwp;
          mSelf += Math.min(l, p);
          pv += p;
        }
        self += mSelf;
        gross += Math.max(0, bill(monthLoad, input.tariff) - bill(Math.max(0, monthLoad - mSelf), input.tariff));
      }
      const i = d * sizes.length + s;
      grossSaving[i] = gross;
      pvKwh[i] = pv;
      selfUseKwh[i] = self;
    });
  });
  return { sizes, dayFractions, grossSaving, pvKwh, selfUseKwh, backend: 'cpu', ms: performance.now() - t0 };
}
