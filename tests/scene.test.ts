import { describe, expect, it } from 'vitest';
import { panelCapacity, usableRoofArea } from '../src/scene/roof';
import { sunDirection, sunPosition } from '../src/scene/sun';

const deg = (r: number) => (r * 180) / Math.PI;

describe('sun position (Nonthaburi 13.86°N)', () => {
  it('is high at solar noon and south of zenith in December', () => {
    const p = sunPosition(13.86, 11, 12);
    expect(deg(p.elevation)).toBeGreaterThan(50);
    expect(deg(p.azimuth)).toBeCloseTo(180, 0);
  });
  it('rises in the east and sets in the west', () => {
    expect(deg(sunPosition(13.86, 3, 8).azimuth)).toBeLessThan(180);
    expect(deg(sunPosition(13.86, 3, 16).azimuth)).toBeGreaterThan(180);
  });
  it('is below the horizon at midnight', () => {
    expect(sunPosition(13.86, 5, 0).elevation).toBeLessThan(0);
    expect(sunDirection(sunPosition(13.86, 5, 0))[1]).toBeLessThan(0);
  });
});

describe('roof geometry', () => {
  const house = { width: 10, depth: 8, floors: 2 as const, pitchDeg: 25, bearingDeg: 180 };
  it('default house gives ~35 m² usable roof (matches the Excel default)', () => {
    expect(usableRoofArea(house)).toBeCloseTo(35.3, 0);
  });
  it('fits the 8 × 590 W GRoof 5 kW package on one slope', () => {
    expect(panelCapacity(house).capacity).toBeGreaterThanOrEqual(8);
  });
  it('fits fewer panels on a narrower house', () => {
    expect(panelCapacity({ ...house, width: 6 }).capacity).toBeLessThan(panelCapacity(house).capacity);
  });
});
