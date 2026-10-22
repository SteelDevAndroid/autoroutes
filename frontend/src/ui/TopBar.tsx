import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { formatCount, formatTime } from './format';
import { useStoreVersion } from './useStoreVersion';

const sum = (array: Float64Array): number => array.reduce((total, value) => total + value, 0);

function ConnectionBadge() {
  const connection = useUiStore((s) => s.connection);
  const freshness = useUiStore((s) => s.freshness);
  const [label, tone] = connection !== 'open'
    ? [connection === 'closed' ? 'Déconnecté' : 'Reconnexion…', 'status-danger']
    : freshness?.status === 'STALE'
      ? ['Données périmées', 'status-danger']
      : freshness?.status === 'CATCHING_UP'
        ? ['Rattrapage', 'status-warn']
        : ['Temps réel', 'status-ok'];
  return <span className={`status ${tone}`} role="status" aria-live="polite">{label}</span>;
}

export function TopBar({ store }: { readonly store: StationStore }) {
  useStoreVersion(store);
  const watermark = useUiStore((s) => s.watermark);
  let active = 0;
  for (let i = 0; i < store.size; i++) {
    if ((store.entries15m[i] ?? 0) + (store.exits15m[i] ?? 0) > 0) {
      active++;
    }
  }
  return (
    <header className="topbar">
      <h1>Supervision des gares de péage</h1>
      <div className="kpi"><span className="kpi-label">Entrées 1 h</span><span className="kpi-value">{formatCount(sum(store.entries1h))}</span></div>
      <div className="kpi"><span className="kpi-label">Sorties 1 h</span><span className="kpi-value">{formatCount(sum(store.exits1h))}</span></div>
      <div className="kpi"><span className="kpi-label">Passages aujourd’hui</span><span className="kpi-value">{formatCount(sum(store.entriesToday) + sum(store.exitsToday))}</span></div>
      <div className="kpi"><span className="kpi-label">Gares actives (15 min)</span><span className="kpi-value">{formatCount(active)} / {formatCount(store.size)}</span></div>
      <span className="topbar-spacer" />
      <div className="kpi"><span className="kpi-label">Données à</span><span className="kpi-value">{formatTime(watermark)}</span></div>
      <ConnectionBadge />
    </header>
  );
}
