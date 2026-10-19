import { describe, expect, it } from 'vitest';
import { getAvailabilityStatus } from './availability-status';

describe('availability display thresholds', () => {
  it.each([99.99, 99.995, 100])('shows green at or above the SLO: %s', (value) => {
    expect(getAvailabilityStatus(value).tone).toBe('healthy');
    expect(getAvailabilityStatus(value).label).toBe('Within SLO');
  });
  it.each([0, 98.72, 99.79, 99.89, 99.90])('shows red at or below the critical limit: %s', (value) => {
    expect(getAvailabilityStatus(value).tone).toBe('danger');
    expect(getAvailabilityStatus(value).label).toBe('Critical');
  });
  it.each([99.90001, 99.95, 99.98999])('shows amber between the limits before rounding: %s', (value) => {
    expect(getAvailabilityStatus(value).tone).toBe('amber');
    expect(getAvailabilityStatus(value).label).toBe('At Risk');
  });
  it.each([undefined, null, NaN, Infinity, -1, 101])('does not imply health for invalid or missing data: %s', (value) => {
    expect(getAvailabilityStatus(value)).toEqual({ tone: 'muted', label: 'No Data' });
  });
});
