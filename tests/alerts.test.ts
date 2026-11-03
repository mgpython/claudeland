import { describe, expect, it } from 'vitest';

import { collectAlerts, worstSeverity, type AlertMemory } from '../src/domain/alerts.js';
import type { UsageLimit, UsageSeverity } from '../src/domain/usage.js';

const FULL_PERCENT = 100;

/** A representative remaining percentage inside each severity band. */
const HEALTHY_REMAINING = 80;
const WARNING_REMAINING = 20;
const CRITICAL_REMAINING = 5;

const REMAINING_BY_SEVERITY: Record<UsageSeverity, number> = {
  ok: HEALTHY_REMAINING,
  warning: WARNING_REMAINING,
  critical: CRITICAL_REMAINING,
};

function limit(severity: UsageSeverity, overrides: Partial<UsageLimit> = {}): UsageLimit {
  const remainingPercent = REMAINING_BY_SEVERITY[severity];
  return {
    id: 'five_hour',
    label: 'Current session',
    consumedPercent: FULL_PERCENT - remainingPercent,
    remainingPercent,
    resetsAt: '2030-06-17T06:09:59.814020+00:00',
    scopeModel: null,
    severity,
    ...overrides,
  };
}

describe('collectAlerts', () => {
  it('stays quiet while every limit is healthy', () => {
    expect(collectAlerts([limit('ok')], new Map())).toEqual([]);
  });

  it('announces warning, then critical, once each within a window', () => {
    const memory: AlertMemory = new Map();

    expect(collectAlerts([limit('warning')], memory).map((a) => a.severity)).toEqual(['warning']);
    expect(collectAlerts([limit('warning')], memory)).toEqual([]);
    expect(collectAlerts([limit('critical')], memory).map((a) => a.severity)).toEqual(['critical']);
    expect(collectAlerts([limit('critical')], memory)).toEqual([]);
  });

  it('does not re-announce a lower severity after a critical alert', () => {
    const memory: AlertMemory = new Map();
    collectAlerts([limit('critical')], memory);

    expect(collectAlerts([limit('warning')], memory)).toEqual([]);
  });

  it('treats sub-second reset jitter as the same window', () => {
    const memory: AlertMemory = new Map();
    collectAlerts([limit('warning')], memory);

    expect(
      collectAlerts([limit('warning', { resetsAt: '2030-06-17T06:10:00.120000+00:00' })], memory),
    ).toEqual([]);
  });

  it('announces again in a new reset window and forgets the old one', () => {
    const memory: AlertMemory = new Map();
    collectAlerts([limit('critical')], memory);

    const next = limit('warning', { resetsAt: '2030-06-17T11:09:59.000000+00:00' });
    expect(collectAlerts([next], memory).map((a) => a.severity)).toEqual(['warning']);
    expect(memory.size).toBe(1);
  });

  it('tracks each limit independently', () => {
    const memory: AlertMemory = new Map();
    const alerts = collectAlerts(
      [limit('warning'), limit('critical', { id: 'seven_day', label: 'Weekly · all models' })],
      memory,
    );

    expect(alerts.map((a) => `${a.limit.id}:${a.severity}`)).toEqual([
      'five_hour:warning',
      'seven_day:critical',
    ]);
  });

  it('handles limits without a reset time', () => {
    const memory: AlertMemory = new Map();

    expect(collectAlerts([limit('warning', { resetsAt: null })], memory)).toHaveLength(1);
    expect(collectAlerts([limit('warning', { resetsAt: null })], memory)).toEqual([]);
  });
});

describe('worstSeverity', () => {
  it('returns the most severe state', () => {
    expect(worstSeverity([])).toBe('ok');
    expect(worstSeverity([limit('ok'), limit('warning')])).toBe('warning');
    expect(worstSeverity([limit('warning'), limit('critical'), limit('ok')])).toBe('critical');
  });
});
