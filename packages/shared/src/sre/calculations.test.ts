import { describe, expect, it } from 'vitest';
import { availability, budgetExhaustionSeconds, burnRate, errorBudgetRemaining } from './calculations.js';

describe('SRE calculations with explicit windows', () => {
  const active = {
    availabilityWindow: { totalRequests: 100000, failedRequests: 1280, windowSeconds: 300 },
    burnRateWindow: { totalRequests: 1000000, failedRequests: 8100, windowSeconds: 3600 },
    budgetWindow: { totalRequests: 100000000, failedRequests: 87600, windowSeconds: 2592000 },
  };
  it('computes 98.72% availability from actual counts', () => {
    expect(availability(active.availabilityWindow)).toBeCloseTo(98.72, 8);
  });
  it('computes 8.1x hourly burn and 142x instantaneous burn without normalization', () => {
    expect(burnRate(active.burnRateWindow, 99.9)).toBeCloseTo(8.1, 8);
    expect(burnRate({ totalRequests: 1000, failedRequests: 142, windowSeconds: 60 }, 99.9)).toBeCloseTo(142, 8);
  });
  it('computes the remaining monthly budget and does not restore it after rollback', () => {
    expect(errorBudgetRemaining(active.budgetWindow, 99.9)).toBeCloseTo(12.4, 8);
    expect(errorBudgetRemaining({ ...active.budgetWindow }, 99.9)).toBeCloseTo(12.4, 8);
  });
  it('computes burn rate and error budget for Four Nines (99.99%) SLO', () => {
    const window = { totalRequests: 10000, failedRequests: 2, windowSeconds: 300 };
    // With 99.99% SLO, allowed error ratio is 0.0001 (1 in 10,000). 2 errors in 10,000 = 2.0x burn rate
    expect(burnRate(window, 99.99)).toBeCloseTo(2.0, 4);
    // Allowed failures = 10,000 * 0.0001 = 1 failure. With 2 failures, budget is exhausted (0%)
    expect(errorBudgetRemaining(window, 99.99)).toBe(0);
    // With 0 failures, 100% budget remaining and 0 burn rate
    expect(burnRate({ totalRequests: 10000, failedRequests: 0, windowSeconds: 300 }, 99.99)).toBe(0);
    expect(errorBudgetRemaining({ totalRequests: 10000, failedRequests: 0, windowSeconds: 300 }, 99.99)).toBe(100);
  });
  it('estimates exhaustion from the SLO period, remaining fraction and burn', () => {
    expect(budgetExhaustionSeconds(12.4, 8.1, 30 * 86400)! / 3600).toBeCloseTo(11.02222, 4);
    expect(budgetExhaustionSeconds(100, 0, 86400)).toBeNull();
    expect(budgetExhaustionSeconds(0, 0, 86400)).toBe(0);
  });
  it('clamps exhausted budgets and handles healthy traffic', () => {
    const window = { totalRequests: 1000, failedRequests: 0, windowSeconds: 60 };
    expect(availability(window)).toBe(100);
    expect(burnRate(window, 99.9)).toBe(0);
    expect(errorBudgetRemaining(window, 99.9)).toBe(100);
    expect(errorBudgetRemaining({ ...window, failedRequests: 500 }, 99.9)).toBe(0);
  });
  it.each([
    { totalRequests: 0, failedRequests: 0, windowSeconds: 60 },
    { totalRequests: 10, failedRequests: 11, windowSeconds: 60 },
    { totalRequests: 10, failedRequests: -1, windowSeconds: 60 },
    { totalRequests: 10, failedRequests: 1, windowSeconds: 0 },
    { totalRequests: Infinity, failedRequests: 1, windowSeconds: 60 },
    { totalRequests: 10.5, failedRequests: 1, windowSeconds: 60 },
  ])('rejects invalid window %j', (window) => {
    expect(() => availability(window)).toThrow();
    expect(() => burnRate(window, 99.9)).toThrow();
    expect(() => errorBudgetRemaining(window, 99.9)).toThrow();
  });
  it.each([0, -1, 100, 101, NaN])('rejects invalid SLO %s', (slo) => {
    expect(() => burnRate(active.burnRateWindow, slo)).toThrow();
    expect(() => errorBudgetRemaining(active.budgetWindow, slo)).toThrow();
  });
});
