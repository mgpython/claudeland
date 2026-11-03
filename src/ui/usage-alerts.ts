import type Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
  collectAlerts,
  worstSeverity,
  type AlertMemory,
  type UsageAlert,
} from '../domain/alerts.js';
import {
  formatPercent,
  formatTimeRemaining,
  localizedLimitLabel,
  type UsageSnapshot,
} from '../domain/usage.js';
import type { UsageController, UsageState } from '../services/usage-controller.js';
import { formatMessage, translate as _ } from './localization.js';

/**
 * Sends one desktop notification when a limit crosses the warning or critical
 * threshold. Stale snapshots never notify: they describe an older reading.
 */
export class UsageAlerts {
  private readonly memory: AlertMemory = new Map();
  private readonly unsubscribe: () => void;
  private lastSnapshot: UsageSnapshot | null = null;

  constructor(
    controller: UsageController,
    private readonly settings: Gio.Settings,
  ) {
    this.unsubscribe = controller.subscribe((state) => this.onState(state));
  }

  destroy(): void {
    this.unsubscribe();
    this.memory.clear();
  }

  private onState(state: Readonly<UsageState>): void {
    const { snapshot } = state;
    if (!snapshot || state.stale || snapshot === this.lastSnapshot) {
      return;
    }
    this.lastSnapshot = snapshot;

    // Always advance the memory, so enabling notifications later does not
    // replay crossings that already happened while they were off.
    const alerts = collectAlerts(snapshot.limits, this.memory);
    if (alerts.length === 0 || !this.settings.get_boolean('notify-thresholds')) {
      return;
    }

    const title =
      worstSeverity(alerts.map(({ limit }) => limit)) === 'critical'
        ? _('Claude usage is critical')
        : _('Claude usage is running low');
    Main.notify(title, alerts.map(describe).join('\n'));
  }
}

function describe({ limit }: UsageAlert): string {
  return formatMessage(
    _('%s: %s remaining · %s'),
    localizedLimitLabel(limit, _),
    formatPercent(limit.remainingPercent),
    formatTimeRemaining(limit.resetsAt, new Date(), _),
  );
}
