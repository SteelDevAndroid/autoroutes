import { GlassHeader, SpatialButton } from './Spatial';
import type { ReactNode } from 'react';
import type { ActivityMetric } from '../state/uiStore';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { AnimatedCount } from './AnimatedCount';
import { formatCount, formatTime } from './format';
import { useStoreVersion } from './useStoreVersion';
import { Icon } from './Icon';
import { anomalySummary } from '../realtime/anomalies';

const sum = (array: Float64Array): number => array.reduce((total, value) => total + value, 0);

function ConnectionBadge() {
  const connection = useUiStore((s) => s.connection);
  const freshness = useUiStore((s) => s.freshness);
  const mode = useUiStore((s) => s.mode);
  const speed = useUiStore((s) => s.replay.speed);
  const [label, tone] = mode === 'replay'
    ? [`Relecture ×${speed}`, 'status-replay']
    : connection !== 'open'
    ? [connection === 'closed' ? 'Déconnecté' : 'Reconnexion…', 'status-danger']
    : freshness?.status === 'STALE'
      ? ['Données périmées', 'status-danger']
      : freshness?.status === 'CATCHING_UP'
        ? ['Rattrapage', 'status-warn']
        : ['Temps réel', 'status-ok'];
  return <span className={`status ${tone}`} role="status" aria-live="polite" data-tour="status">{label}</span>;
}

function Account() {
  const me = useUiStore((s) => s.me);
  if (me?.authenticated !== true) {
    return null;
  }
  return (
    <form method="post" action="/logout" className="account">
      <span className="account-name" title={me.roles.join(', ')}>{me.name}</span>
      <SpatialButton type="submit" className="icon-button">Déconnexion</SpatialButton>
    </form>
  );
}

/** Ouvre ou ferme le tiroir du panneau latéral ; visible seulement sur petit écran (feuille de style). */
function DrawerToggle() {
  const open = useUiStore((s) => s.drawerOpen);
  const setOpen = useUiStore((s) => s.setDrawerOpen);
  return (
    <SpatialButton id="drawer-toggle" type="button" className="icon-button drawer-toggle" aria-expanded={open} aria-controls="side-panel"
      aria-label="Panneau des couches et des filtres" onClick={() => { setOpen(!open); }}><Icon name="menu" /></SpatialButton>
  );
}

function HelpButton() {
  const setAboutOpen = useUiStore((s) => s.setAboutOpen);
  return <SpatialButton type="button" className="icon-button help-button" data-tour="help" aria-label="Aide et à propos des données" onClick={() => { setAboutOpen(true); }}><Icon name="help" /><span>Aide</span></SpatialButton>;
}

function MetricButton({ metric, children, disabled = false }: {
  readonly metric: ActivityMetric; readonly children: ReactNode; readonly disabled?: boolean;
}) {
  const active = useUiStore((s) => s.openSection === 'activity' && s.activityMetric === metric);
  return <button type="button" className="kpi-link" disabled={disabled} aria-controls="section-activity" aria-expanded={active}
    onClick={() => {
      const ui = useUiStore.getState();
      ui.setActivityMetric(metric);
      ui.setOpenSection('activity');
      ui.setDrawerOpen(window.matchMedia('(max-width: 900px)').matches);
      requestAnimationFrame(() => { document.querySelector<HTMLButtonElement>('.section-toggle[aria-controls="section-activity"]')?.focus(); });
    }}>{children}</button>;
}

export function TopBar({ store }: { readonly store: StationStore }) {
  useStoreVersion(store);
  const watermark = useUiStore((s) => s.watermark);
  const mode = useUiStore((s) => s.mode);
  let active = 0;
  let anomalies = 0;
  let reported = 0;
  for (let i = 0; i < store.size; i++) {
    const stationAnomalies = store.anomalies[i];
    if (stationAnomalies != null) {
      reported++;
      anomalies += anomalySummary(stationAnomalies).count;
    }
    if ((store.entries15m[i] ?? 0) + (store.exits15m[i] ?? 0) > 0) {
      active++;
    }
  }
  return (
    <GlassHeader className="topbar">
      <div className="topbar-title">
      <DrawerToggle />
      <span className="brand-mark"><Icon name="route" /></span>
      <div className="brand"><span className="brand-name">Autoroutes<span className="brand-dot">.</span></span>
      <h1 aria-label="Supervision des gares de péage"><span className="title-full">Supervision des gares de péage</span><span className="title-compact" aria-hidden="true">Supervision du réseau</span></h1></div>
      </div>
      <div className="topbar-metrics">
      <div className="kpi"><MetricButton metric="entries1h"><span className="kpi-label">Entrées 1 h</span><span className="kpi-value"><AnimatedCount value={sum(store.entries1h)} /></span></MetricButton></div>
      <div className="kpi"><MetricButton metric="exits1h"><span className="kpi-label">Sorties 1 h</span><span className="kpi-value"><AnimatedCount value={sum(store.exits1h)} /></span></MetricButton></div>
      <div className="kpi" role="group" aria-label="Anomalies en cours"
        title={mode === 'replay' ? 'Historique des anomalies indisponible en relecture.'
          : reported === 0 ? 'État des anomalies non communiqué.'
          : `Occurrences signalées sur ${formatCount(reported)} / ${formatCount(store.size)} gares. Les états non communiqués ne sont pas comptés comme zéro.`}>
        <MetricButton metric="anomalies" disabled={mode === 'replay' || reported === 0}><span className="kpi-label">Anomalies en cours</span>
        <span className="kpi-value">{mode === 'replay' || reported === 0 ? '—'
          : <>{reported < store.size && <span aria-label="au moins">≥ </span>}<AnimatedCount value={anomalies} /></>}</span></MetricButton>
      </div>
      <div className="kpi kpi-secondary"><MetricButton metric="today"><span className="kpi-label">Passages aujourd’hui</span><span className="kpi-value"><AnimatedCount value={sum(store.entriesToday) + sum(store.exitsToday)} /></span></MetricButton></div>
      <div className="kpi kpi-secondary"><MetricButton metric="active15m"><span className="kpi-label">Gares actives (15 min)</span><span className="kpi-value">{formatCount(active)} / {formatCount(store.size)}</span></MetricButton></div>
      <div className="kpi kpi-time"><span className="kpi-label">Données à · Paris</span><span className="kpi-value">{formatTime(watermark)}</span></div>
      </div>
      <div className="topbar-actions">
      <ConnectionBadge />
      <HelpButton />
      <Account />
      </div>
    </GlassHeader>
  );
}
