import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HistoryState, TrendPoint } from './kpiTrends';
import { HOUR_MS, MINUTE_MS, hourlyChange, minuteWindow, timedTrendPath } from './kpiTrends';
import { formatCount, formatPercent, formatTime } from './format';

/** Même fenêtre pour le tracé, les repères, le survol et la comparaison. Aucun trou n'est comblé. */
export function KpiTrend({ points, label, recorded = false, expanded = false, reference,
  historyState = 'local', stale = false }: {
  readonly points: readonly TrendPoint[]; readonly label: string; readonly recorded?: boolean; readonly expanded?: boolean;
  readonly reference?: number; readonly historyState?: HistoryState; readonly stale?: boolean;
}) {
  const anchor = reference ?? points.at(-1)?.t ?? 0;
  const end = Number.isFinite(anchor) ? anchor : 0;
  const window = useMemo(() => minuteWindow(points, end), [points, end]);
  const shown = useMemo(() => recorded ? window.points : points.filter((p) => p.t >= end - HOUR_MS && p.t <= end),
    [recorded, window, points, end]);
  const path = useMemo(() => timedTrendPath(shown, 96, 22, { start: end - HOUR_MS, end }), [shown, end]);
  const range = { start: end - HOUR_MS, end };
  const change = recorded && historyState === 'ready' && !stale ? hourlyChange(points, end) : null;
  const status = historyState === 'loading' ? 'Chargement…'
    : historyState === 'error' ? 'Historique indisponible'
    : stale && shown.length > 0 ? 'Données anciennes'
    : recorded ? window.complete ? window.total === 0 ? 'Aucun trafic' : 'Historique complet'
      : `Historique partiel · ${shown.length}/60 min`
    : shown.length > 0 ? 'Suivi local · partiel' : 'Aucune donnée';
  const comparison = change === 'new' ? 'Nouveau trafic' : change === null ? null
    : `${change > 0 ? '+' : ''}${formatPercent(change)} vs heure précédente`;
  const total = recorded ? `${window.complete ? 'Total sur 1 h' : 'Total disponible'} : ${formatCount(window.total)}${window.complete ? '' : ` (${shown.length}/60 min)`}`
    : 'Total historique sur 1 h indisponible';
  const detail = `${label} · ${status} · ${total}${comparison === null ? ' · comparaison indisponible' : ` · ${comparison}`}`;
  const ref = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const selected = selectedTime === null ? shown.at(-1)
    : recorded ? shown.find((p) => p.t === selectedTime)
      : shown.find((p) => Math.abs(p.t - selectedTime) <= 2500);
  const place = () => {
    const box = ref.current?.getBoundingClientRect();
    if (box !== undefined) {
      const left = Math.max(8, Math.min(box.left, globalThis.innerWidth - 256));
      const top = Math.max(8, Math.min(box.bottom + 6, globalThis.innerHeight - 132));
      setPosition((previous) => previous.left === left && previous.top === top ? previous : { left, top });
    }
  };
  useEffect(() => {
    const button = ref.current?.closest('button');
    const focus = () => { setFocused(true); setOpen(true); place(); };
    const blur = () => { setFocused(false); setOpen(false); setSelectedTime(null); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); return; }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setOpen(true); place();
      setSelectedTime((t) => {
        const index = t === null ? shown.length - 1 : shown.findIndex((p) => p.t === t);
        return shown[Math.max(0, Math.min(shown.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)))]?.t ?? null;
      });
    };
    button?.addEventListener('focus', focus);
    button?.addEventListener('blur', blur);
    button?.addEventListener('keydown', key);
    return () => { button?.removeEventListener('focus', focus); button?.removeEventListener('blur', blur); button?.removeEventListener('keydown', key); };
  }, [shown]);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => { setOpen(false); };
    globalThis.addEventListener('scroll', close, true);
    globalThis.addEventListener('resize', close);
    return () => { globalThis.removeEventListener('scroll', close, true); globalThis.removeEventListener('resize', close); };
  }, [open]);
  useEffect(() => {
    const button = ref.current?.closest('button');
    if (!open || button == null) return undefined;
    const previous = button.getAttribute('aria-describedby');
    button.setAttribute('aria-describedby', [previous, tooltipId].filter(Boolean).join(' '));
    return () => {
      if (previous === null) button.removeAttribute('aria-describedby');
      else button.setAttribute('aria-describedby', previous);
    };
  }, [open, tooltipId]);
  const stamp = selected?.t ?? selectedTime;
  const value = selected === undefined ? 'Donnée absente' : recorded ? `${formatCount(selected.value)} /min` : `Compteur : ${formatCount(selected.value)}`;
  return <span ref={ref} className={`kpi-trend${shown.length === 0 ? ' kpi-trend-empty' : ''}${expanded ? ' kpi-trend-expanded' : ''}`}>
    <svg width="96" height="22" viewBox="0 0 96 22" preserveAspectRatio={expanded ? 'none' : undefined} role="img"
      aria-label={detail} aria-describedby={open ? tooltipId : undefined}
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, ((event.clientX - box.left) / Math.max(1, box.width) * 96 - 2) / 92));
        const time = range.start + ratio * HOUR_MS;
        setSelectedTime(recorded ? Math.min(end - MINUTE_MS, Math.round(time / MINUTE_MS) * MINUTE_MS)
          : shown.reduce<number | null>((nearest, p) => nearest === null || Math.abs(p.t - time) < Math.abs(nearest - time) ? p.t : nearest, null));
        setOpen(true); place();
      }} onPointerLeave={() => { setOpen(focused); setSelectedTime(null); }}>
      <path className="kpi-trend-baseline" d="M2,20 H94" />
      {shown.length > 1 && <path d={path} />}
      {shown.length === 1 && <path d={path + ' l0,0'} className="kpi-trend-dot" />}
    </svg>
    {expanded && <span className="kpi-trend-axis" aria-hidden="true"><span>−60 min</span><span>−30 min</span><span>{stale ? 'Dernière donnée' : 'Maintenant'}</span></span>}
    <span className="kpi-trend-period" title={detail}>{expanded ? `${recorded ? '/min · ' : ''}${status}` : historyState === 'loading' ? '…' : historyState === 'error' ? 'Indispo' : recorded ? '/min' : shown.length > 0 ? 'Suivi' : '—'}</span>
    {expanded && comparison !== null && <span className="kpi-trend-change">{comparison}</span>}
    {open && createPortal(<span id={tooltipId} role="tooltip" aria-live={focused ? 'polite' : undefined} className="kpi-tooltip" style={position}>
      <strong>{stamp == null ? 'Heure indisponible' : `${formatTime(stamp)} (Paris)`} · {value}</strong>
      <span>{total}</span><span>{status}</span>
      <span>{comparison ?? 'Comparaison indisponible : deux heures complètes requises.'}</span>
      <span>{recorded ? 'Historique enregistré · retard possible de 60 s' : 'Évolution du compteur depuis l’ouverture'}</span>
    </span>, document.body)}
  </span>;
}
