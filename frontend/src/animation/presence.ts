import { easeOutCubic } from './easing';

type Phase = 'in' | 'present' | 'out';

interface Entry {
  phase: Phase;
  start: number;
  /** Opacité au début de la transition en cours : un élément qui revient pendant qu'il disparaît repart de là, sans saut. */
  from: number;
}

export interface PresenceTick {
  /** Opacités (0 à 1) qui ont changé depuis l'image précédente. */
  readonly changed: ReadonlyMap<string, number>;
  /** Éléments dont la disparition est terminée : à retirer de l'affichage. */
  readonly removed: readonly string[];
  /** Il reste des transitions en cours : la boucle doit continuer. */
  readonly active: boolean;
}

/**
 * Apparition et disparition en fondu d'éléments identifiés par une clé (flux O/D tracés sur la carte).
 * Calcul pur à partir de l'horodatage de l'image : aucune dépendance à MapLibre, testable sans navigateur.
 * Durée nulle (mouvement réduit) : tout est immédiat.
 */
export class Presence {
  private readonly entries = new Map<string, Entry>();

  constructor(private durationMs: number) {}

  /** Mouvement réduit (durée nulle) ou rétabli : s'applique aux transitions à venir. */
  setDuration(durationMs: number): void {
    this.durationMs = durationMs;
  }

  /** Déclare les clés présentes maintenant ; celles qui n'y sont plus se mettent à disparaître, les nouvelles à apparaître. */
  update(keys: Iterable<string>, now: number): void {
    const wanted = new Set(keys);
    for (const key of wanted) {
      const entry = this.entries.get(key);
      if (entry === undefined) {
        this.entries.set(key, this.durationMs <= 0 ? { phase: 'present', start: now, from: 1 } : { phase: 'in', start: now, from: 0 });
      } else if (entry.phase === 'out') {
        this.entries.set(key, { phase: 'in', start: now, from: this.alpha(key, now) });
      }
    }
    for (const [key, entry] of this.entries) {
      if (wanted.has(key)) {
        continue;
      }
      if (this.durationMs <= 0) {
        this.entries.delete(key);
      } else if (entry.phase !== 'out') {
        this.entries.set(key, { phase: 'out', start: now, from: this.alpha(key, now) });
      }
    }
  }

  alpha(key: string, now: number): number {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return 0;
    }
    if (entry.phase === 'present') {
      return 1;
    }
    const progress = this.durationMs <= 0 ? 1 : easeOutCubic((now - entry.start) / this.durationMs);
    return entry.phase === 'in' ? entry.from + (1 - entry.from) * progress : entry.from * (1 - progress);
  }

  /** Clés encore affichées parce qu'elles disparaissent : le rendu doit conserver leur géométrie. */
  leaving(): string[] {
    return [...this.entries].filter(([, entry]) => entry.phase === 'out').map(([key]) => key);
  }

  get active(): boolean {
    return [...this.entries.values()].some((entry) => entry.phase !== 'present');
  }

  tick(now: number): PresenceTick {
    const changed = new Map<string, number>();
    const removed: string[] = [];
    for (const [key, entry] of this.entries) {
      if (entry.phase === 'present') {
        continue;
      }
      const done = this.durationMs <= 0 || now - entry.start >= this.durationMs;
      if (entry.phase === 'out' && done) {
        this.entries.delete(key);
        removed.push(key);
        continue;
      }
      changed.set(key, done ? 1 : this.alpha(key, now));
      if (done) {
        entry.phase = 'present';
      }
    }
    return { changed, removed, active: this.active };
  }
}
