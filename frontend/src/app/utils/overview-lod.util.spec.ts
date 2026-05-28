import { describe, expect, it } from 'vitest';
import { resolveOverviewLod } from './overview-lod.util';

describe('resolveOverviewLod', () => {
  it('uses L100 polygon for city zoom (R1)', () => {
    const plan = resolveOverviewLod(12, 200, 150);
    expect(plan.tier).toBe('L100');
    expect(plan.readMode).toBe('polygon');
  });

  it('uses L100 index slice for regional zoom (R2)', () => {
    const plan = resolveOverviewLod(10.5, 400, 300);
    expect(plan.tier).toBe('L100');
    expect(plan.readMode).toBe('index_slice');
  });

  it('uses L500 for medium extent', () => {
    const plan = resolveOverviewLod(9.5, 800, 600);
    expect(plan.tier).toBe('L500');
    expect(plan.readMode).toBe('index_slice');
    expect(plan.blockFactor).toBe(5);
  });

  it('uses L1000 for country zoom (R4)', () => {
    const plan = resolveOverviewLod(7, 3000, 2000);
    expect(plan.tier).toBe('L1000');
    expect(plan.blockFactor).toBe(10);
  });

  it('forces L1000 when viewport covers most of Switzerland', () => {
    const plan = resolveOverviewLod(11, 3000, 2000);
    expect(plan.tier).toBe('L1000');
  });
});
