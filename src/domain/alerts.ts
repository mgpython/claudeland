/**
 * Decides when a usage limit deserves a desktop notification.
 *
 * A limit is announced once when it enters the warning band and once more
 * when it enters the critical band. The memory is keyed by limit and reset
 * window, so a new window starts quiet again and a recovered limit is not
 * re-announced until it degrades in a later window.
 */

import type { UsageLimit, UsageSeverity } from './usage.js';

export interface UsageAlert {
  limit: UsageLimit;
  severity: Exclude<UsageSeverity, 'ok'>;
}

/** Highest severity already announced, per limit and reset window. */
export type AlertMemory = Map<string, UsageSeverity>;

const MS_PER_MINUTE = 60_000;
const RESET_BUCKET_MINUTES = 15;

/**
 * The API reports reset timestamps with sub-second precision that is not
 * guaranteed to be identical between polls. Bucketing keeps one window one key.
 */
const RESET_BUCKET_MS = RESET_BUCKET_MINUTES * MS_PER_MINUTE;

/** Ordered from least to most severe; the index is the rank. */
const SEVERITY_ORDER: readonly UsageSeverity[] = ['ok', 'warning', 'critical'];

const rank = (severity: UsageSeverity): number => SEVERITY_ORDER.indexOf(severity);

const isAlertSeverity = (severity: UsageSeverity): severity is UsageAlert['severity'] =>
  severity !== 'ok';

export function collectAlerts(limits: readonly UsageLimit[], memory: AlertMemory): UsageAlert[] {
  const keyed = limits.map((limit) => ({ limit, key: alertKey(limit) }));

  const alerts = keyed
    .filter(({ limit, key }) => rank(limit.severity) > rank(memory.get(key) ?? 'ok'))
    .flatMap(({ limit, key }) => {
      const { severity } = limit;
      if (!isAlertSeverity(severity)) {
        return [];
      }
      memory.set(key, severity);
      return [{ limit, severity }];
    });

  // Forget windows that no longer exist so the memory cannot grow unbounded.
  const current = new Set(keyed.map(({ key }) => key));
  [...memory.keys()].filter((key) => !current.has(key)).forEach((key) => memory.delete(key));

  return alerts;
}

/** The most severe state across all limits, for tinting the panel. */
export function worstSeverity(limits: readonly UsageLimit[]): UsageSeverity {
  return limits.reduce<UsageSeverity>(
    (worst, { severity }) => (rank(severity) > rank(worst) ? severity : worst),
    'ok',
  );
}

function alertKey(limit: UsageLimit): string {
  const reset = limit.resetsAt ? Date.parse(limit.resetsAt) : Number.NaN;
  const window = Number.isFinite(reset) ? String(Math.round(reset / RESET_BUCKET_MS)) : 'none';
  return `${limit.id}@${window}`;
}
