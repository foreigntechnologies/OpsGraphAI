export const AVAILABILITY_TARGET = 99.99;
export const AVAILABILITY_CRITICAL = 99.90;

/** Compare the measured percentage before display rounding. */
export function getAvailabilityStatus(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0 || value > 100) {
    return { tone: 'muted', label: 'No Data' } as const;
  }
  if (value >= AVAILABILITY_TARGET) return { tone: 'healthy', label: 'Within SLO' } as const;
  if (value <= AVAILABILITY_CRITICAL) return { tone: 'danger', label: 'Critical' } as const;
  return { tone: 'amber', label: 'At Risk' } as const;
}
