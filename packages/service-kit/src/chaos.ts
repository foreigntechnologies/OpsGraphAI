import type { Request, Response, NextFunction } from 'express';
import type { Logger } from './logger.js';
import type { ChaosScenario, ChaosScenarioType, ChaosState } from '@opsgraph/shared';

export interface ChaosConfig {
  databaseLatencyMs: number;
  errorRatePercent: number;
  dependencyTimeoutMs: number;
  expiresAt: number | null;
}

export class ChaosEngine {
  private config: ChaosConfig = {
    databaseLatencyMs: 0,
    errorRatePercent: 0,
    dependencyTimeoutMs: 0,
    expiresAt: null,
  };
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private serviceName: string,
    private logger: Logger,
    private isAllowed = process.env.CHAOS_ENABLED === 'true' && process.env.NODE_ENV !== 'production',
  ) {}

  public getChaosState(): ChaosState {
    const activeScenarios: ChaosScenario[] = [];
    const expiresAtIso = this.config.expiresAt ? new Date(this.config.expiresAt).toISOString() : null;

    if (this.config.databaseLatencyMs > 0) {
      activeScenarios.push({
        type: 'DATABASE_LATENCY',
        service: this.serviceName,
        enabled: true,
        params: { latencyMs: this.config.databaseLatencyMs },
        expiresAt: expiresAtIso,
      });
    }

    if (this.config.errorRatePercent > 0) {
      activeScenarios.push({
        type: 'ERROR_SPIKE',
        service: this.serviceName,
        enabled: true,
        params: { errorRatePercent: this.config.errorRatePercent },
        expiresAt: expiresAtIso,
      });
    }

    if (this.config.dependencyTimeoutMs > 0) {
      activeScenarios.push({
        type: 'DEPENDENCY_TIMEOUT',
        service: this.serviceName,
        enabled: true,
        params: { timeoutMs: this.config.dependencyTimeoutMs },
        expiresAt: expiresAtIso,
      });
    }

    return {
      enabled: this.isAllowed,
      environment: process.env.NODE_ENV ?? 'development',
      activeScenarios,
    };
  }

  public setScenario(type: ChaosScenarioType, params: Record<string, unknown>, ttlMinutes = 10) {
    if (!this.isAllowed) {
      throw new Error('Chaos injection is disabled in this environment');
    }

    const cappedTtl = Math.min(Math.max(1, ttlMinutes), 30);
    const expiresAt = Date.now() + cappedTtl * 60 * 1000;
    this.config.expiresAt = expiresAt;

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.resetAll(), cappedTtl * 60 * 1000);

    if (type === 'DATABASE_LATENCY') {
      const delay = Number(params.latencyMs ?? 1500);
      this.config.databaseLatencyMs = delay;
      this.logger.warn({ change: 'runtime configuration changed', parameter: 'db.query_delay_ms', value: delay, ttlMinutes: cappedTtl }, 'Runtime configuration updated');
    } else if (type === 'ERROR_SPIKE') {
      const rate = Number(params.errorRatePercent ?? 20);
      this.config.errorRatePercent = rate;
      this.logger.warn({ change: 'runtime configuration changed', parameter: 'server.chaos_error_rate', value: rate, ttlMinutes: cappedTtl }, 'Runtime configuration updated');
    } else if (type === 'DEPENDENCY_TIMEOUT') {
      const timeout = Number(params.timeoutMs ?? 3000);
      this.config.dependencyTimeoutMs = timeout;
      this.logger.warn({ change: 'runtime configuration changed', parameter: 'dependency.timeout_ms', value: timeout, ttlMinutes: cappedTtl }, 'Runtime configuration updated');
    }
  }

  public resetAll() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const hadChanges = this.config.databaseLatencyMs > 0 || this.config.errorRatePercent > 0 || this.config.dependencyTimeoutMs > 0;
    this.config = {
      databaseLatencyMs: 0,
      errorRatePercent: 0,
      dependencyTimeoutMs: 0,
      expiresAt: null,
    };
    if (hadChanges) {
      this.logger.info({ change: 'runtime configuration changed', parameter: 'all', value: 'default' }, 'All chaos scenarios reset to normal');
    }
  }

  public async maybeInjectDatabaseLatency() {
    if (this.config.databaseLatencyMs > 0) {
      this.logger.warn({ latencyMs: this.config.databaseLatencyMs }, 'slow database query execution');
      await new Promise((resolve) => setTimeout(resolve, this.config.databaseLatencyMs));
    }
  }

  public middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Check if error spike chaos is active
      if (this.config.errorRatePercent > 0) {
        const roll = Math.random() * 100;
        if (roll < this.config.errorRatePercent) {
          this.logger.error({ route: req.path, statusCode: 500 }, 'request failed due to internal server failure');
          return res.status(500).json({ error: 'Internal Server Error', service: this.serviceName });
        }
      }
      next();
    };
  }

  public getDatabaseLatency(): number {
    return this.config.databaseLatencyMs;
  }

  public getDependencyTimeout(): number {
    return this.config.dependencyTimeoutMs;
  }
}
