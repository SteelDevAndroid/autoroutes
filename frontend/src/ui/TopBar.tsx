import { GlassHeader, SpatialButton } from './Spatial';
import { useState, type ReactNode } from 'react';
import type { ActivityMetric } from '../state/uiStore';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { AnimatedCount } from './AnimatedCount';
import { formatCount, formatTime } from './format';
import { useStoreVersion } from './useStoreVersion';
import { Icon } from './Icon';
import { anomalySummary } from '../realtime/anomalies';
import { KpiTrend } from './KpiTrend';
import { timelinePoints } from './kpiTrends';
import type { KpiMetric } from './kpiTrends';
import { useKpiTrends } from './useKpiTrends';

const sum = (array: Float64Array): number => array.reduce((total, value) => total + value, 0);

function ConnectionBadge() {
  const connection = useUiStore((s) => s.connection);
  const freshness = useUiStore((s) => s.freshness);
  const mode = useUiStore((s) => s.mode);
  const watermark = useUiStore((s) => s.watermark);
  const speed = useUiStore((s) => s.replay.speed);
  const [label, tone] = mode === 'replay'
    ? [`Relecture ×${speed}`, 'status-replay']
    : connection !== 'open'
    ? [connection === 'closed' ? 'Déconnecté' : watermark === null ? 'Connexion initiale…' : 'Reconnexion…', watermark === null && connection !== 'closed' ? 'status-warn' : 'status-danger']
    : freshness?.status === 'STALE'
      ? ['Données périmées', 'status-danger']
      : freshness?.status === 'CATCHING_UP'
        ? ['Rattrapage', 'status-warn']
        : ['Temps réel', 'status-ok'];
  const detail = mode === 'replay' ? 'Lecture de données historiques' : watermark === null ? 'En attente des premières données'
    : <>Dernière mise à jour : <time dateTime={watermark}>{formatTime(watermark)}</time> · Paris{connection !== 'open' ? ' · dernières données conservées' : ''}</>;
  return <div className="connection-summary"><span className={`status ${tone}`} role="status" aria-live="polite" data-tour="status">{label}</span><span className="connection-detail">{detail}</span></div>;
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

function MetricReading({ children, chart, chartOnly = false }: {
  readonly children: ReactNode; readonly chart: ReactNode; readonly chartOnly?: boolean;
}) {
  return <span className="kpi-reading"><span className={chartOnly ? 'sr-only' : 'kpi-value'}>{children}</span>{chart}</span>;
}

export function TopBar({ store }: { readonly store: StationStore }) {
  useStoreVersion(store);
  const [moreMetrics, setMoreMetrics] = useState(false);
  const mode = useUiStore((s) => s.mode);
  const trends = useKpiTrends(store);
  const chart = (metric: KpiMetric, label: string) => {
    const traffic = metric === 'entries1h' || metric === 'exits1h' || metric === 'today';
    const recorded = traffic && trends.points.length > 0;
    const points = recorded ? trends.points.map((p) => ({ t: p.t * 1000,
      value: metric === 'entries1h' ? p.entries : metric === 'exits1h' ? p.exits : p.entries + p.exits }))
      : timelinePoints(trends.samples, metric);
    return <KpiTrend points={points} label={recorded ? `${label} par minute sur la dernière heure` : `Évolution du compteur ${label}`}
      recorded={recorded} expanded={metric === 'entries1h' || metric === 'exits1h'} />;
  };
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
      <span className="brand-mark" aria-hidden="true"><Icon name="route" /></span>
      <div className="brand"><span className="brand-name">Autoroutes<span className="brand-dot">.</span></span><span className="brand-scope">Réseau national · France</span></div>
      </div>
      <div className="screen-heading"><h1 aria-label="Supervision des gares de péage"><span className="title-full">Supervision des gares de péage</span><span className="title-compact" aria-hidden="true">Supervision du réseau</span></h1></div>
      <div className="topbar-metrics">
      <div className="kpi"><MetricButton metric="entries1h"><span className="kpi-label">Entrées 1 h</span><MetricReading chartOnly chart={chart('entries1h', 'Entrées')}>{formatCount(sum(store.entries1h))}</MetricReading></MetricButton></div>
      <div className="kpi"><MetricButton metric="exits1h"><span className="kpi-label">Sorties 1 h</span><MetricReading chartOnly chart={chart('exits1h', 'Sorties')}>{formatCount(sum(store.exits1h))}</MetricReading></MetricButton></div>
      <div className="kpi" role="group" aria-label="Anomalies en cours"
        title={mode === 'replay' ? 'Historique des anomalies indisponible en relecture.'
          : reported === 0 ? 'État des anomalies non communiqué.'
          : `Occurrences signalées sur ${formatCount(reported)} / ${formatCount(store.size)} gares. Les états non communiqués ne sont pas comptés comme zéro.`}>
        <MetricButton metric="anomalies" disabled={mode === 'replay' || reported === 0}><span className="kpi-label">Anomalies en cours</span>
        <MetricReading chart={chart('anomalies', 'Anomalies en cours')}>{mode === 'replay' || reported === 0 ? '—'
          : <>{reported < store.size && <span aria-label="au moins">≥ </span>}<AnimatedCount value={anomalies} /></>}</MetricReading></MetricButton>
      </div>
      <SpatialButton className="metrics-toggle" aria-expanded={moreMetrics} aria-controls="network-secondary-metrics"
        onClick={() => { setMoreMetrics(!moreMetrics); }}>
        {moreMetrics ? 'Moins d’indicateurs' : 'Plus d’indicateurs'}<Icon name="chevron" />
      </SpatialButton>
      <div id="network-secondary-metrics" className="secondary-metrics" hidden={!moreMetrics}>
        <div className="kpi"><MetricButton metric="today"><span className="kpi-label">Passages aujourd’hui</span><MetricReading chart={chart('today', 'Passages')}><AnimatedCount value={sum(store.entriesToday) + sum(store.exitsToday)} /></MetricReading></MetricButton></div>
        <div className="kpi"><MetricButton metric="active15m"><span className="kpi-label">Gares actives (15 min)</span><MetricReading chart={chart('active15m', 'Gares actives sur 15 min')}>{formatCount(active)} / {formatCount(store.size)}</MetricReading></MetricButton></div>
      </div>
      </div>
      <div className="topbar-actions">
      <ConnectionBadge />
      <HelpButton />
      <Account />
      </div>
    </GlassHeader>
  );
}
