import { useState } from 'react';
import { useUiStore } from '../state/uiStore';

export const SPEEDS = [1, 10, 60, 300] as const;
const DURATIONS = [30, 60, 180, 360] as const;

/** Valeur par défaut du champ datetime-local : il y a deux heures, à la minute, dans le fuseau du poste. */
function defaultStart(): string {
  const date = new Date(Date.now() - 2 * 3_600_000);
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export interface ReplayControls {
  readonly start: (from: Date, durationMinutes: number, speed: number) => void;
  readonly playPause: () => void;
  readonly setSpeed: (speed: number) => void;
  readonly backToLive: () => void;
}

export function ReplayPanel({ controls }: { readonly controls: ReplayControls }) {
  const mode = useUiStore((s) => s.mode);
  const replay = useUiStore((s) => s.replay);
  const [start, setStart] = useState(defaultStart);
  const [duration, setDuration] = useState<number>(60);
  const [speed, setSpeed] = useState<number>(60);

  return (
    <section aria-label="Relecture de l'historique">
      <h2>Relecture</h2>
      {mode === 'live' ? (
        <>
          <label>Début <input type="datetime-local" aria-label="Début de relecture" value={start} onChange={(e) => { setStart(e.target.value); }} /></label>
          <label>Durée
            <select aria-label="Durée de relecture" value={duration} onChange={(e) => { setDuration(Number(e.target.value)); }}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} h`}</option>)}
            </select>
          </label>
          <label>Vitesse
            <select aria-label="Vitesse de relecture" value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); }}>
              {SPEEDS.map((s) => <option key={s} value={s}>×{s}</option>)}
            </select>
          </label>
          <button type="button" className="icon-button" onClick={() => { controls.start(new Date(start), duration, speed); }}>
            Lancer la relecture
          </button>
          {replay.status === 'error' && replay.error !== null && <p className="note status-danger" role="alert">{replay.error}</p>}
          <p className="note">7 derniers jours, données observées minute par minute.</p>
        </>
      ) : (
        <>
          <div className="replay-controls">
            <button type="button" className="icon-button" onClick={controls.playPause} disabled={replay.status === 'loading'}>
              {replay.status === 'playing' ? 'Pause' : 'Lecture'}
            </button>
            <select aria-label="Vitesse de relecture" value={replay.speed}
              onChange={(e) => { controls.setSpeed(Number(e.target.value)); }}>
              {SPEEDS.map((s) => <option key={s} value={s}>×{s}</option>)}
            </select>
            <button type="button" className="icon-button" onClick={controls.backToLive}>Retour au direct</button>
          </div>
          <p className="note" aria-live="polite">
            {replay.status === 'loading' ? 'Chargement de l’historique…' : replay.status === 'ended' ? 'Fin de la période' : null}
          </p>
        </>
      )}
    </section>
  );
}
