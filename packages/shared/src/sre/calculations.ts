import { z } from 'zod';

export const requestWindowSchema = z.object({
  totalRequests: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  failedRequests: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  windowSeconds: z.number().positive().finite(),
}).refine((value) => value.failedRequests <= value.totalRequests, {
  message: 'Failed requests cannot exceed total requests',
});
export type RequestWindow = z.infer<typeof requestWindowSchema>;
const sloSchema = z.number().gt(0).lt(100);

/** Returns percent; undefined traffic is invalid, never silently 100% healthy. */
export function availability(window: RequestWindow): number {
  const { totalRequests, failedRequests } = requestWindowSchema.parse(window);
  return 100 * (1 - failedRequests / totalRequests);
}

export function errorBudgetRemaining(window: RequestWindow, sloPercent: number): number {
  const { totalRequests, failedRequests } = requestWindowSchema.parse(window);
  const allowedFailures = totalRequests * (1 - sloSchema.parse(sloPercent) / 100);
  return Math.max(0, 100 * (1 - failedRequests / allowedFailures));
}

/** Numerator and denominator must represent the same SLI; the window is explicit. */
export function burnRate(window: RequestWindow, sloPercent: number): number {
  const { totalRequests, failedRequests } = requestWindowSchema.parse(window);
  return (failedRequests / totalRequests) / (1 - sloSchema.parse(sloPercent) / 100);
}

/** Constant traffic approximation; null means no current budget consumption. */
export function budgetExhaustionSeconds(remainingPercent: number, rate: number, periodSeconds: number): number | null {
  z.number().min(0).max(100).parse(remainingPercent);
  z.number().nonnegative().finite().parse(rate);
  z.number().positive().finite().parse(periodSeconds);
  if (remainingPercent === 0) return 0;
  return rate === 0 ? null : (remainingPercent / 100) * periodSeconds / rate;
}
