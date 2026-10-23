import { easeOutCubic } from './easing';

export interface LoadStep {
  /** Intensités (0 à 1) à écrire pour cette image. */
  readonly set: readonly (readonly [string, number])[];
  /** Tronçons revenus à 0 : leur état peut être retiré. */
  readonly clear: readonly string[];
  readonly active: boolean;
}

/**
 * Fondu des charges de tronçons d'une estimation à la suivante : un tronçon qui apparaît monte de 0, un tronçon qui disparaît
 * descend jusqu'à 0 avant d'être retiré. Une nouvelle estimation reprend les valeurs affichées, sans saut.
 */
export class LoadTween {
  private readonly shown = new Map<string, number>();
  private readonly from = new Map<string, number>();
  private readonly to = new Map<string, number>();
  private start = 0;

  constructor(private durationMs: number) {}

  setDuration(durationMs: number): void {
    this.durationMs = durationMs;
  }

  /** Valeur actuellement affichée d'un tronçon (0 s'il n'est pas affiché). */
  value(id: string): number {
    return this.shown.get(id) ?? 0;
  }

  /** Nouvelles cibles : `set` (identifiant, intensité) et `clear` (tronçons qui disparaissent). */
  retarget(set: readonly (readonly [string, number])[], clear: readonly string[], now: number): void {
    // Les mouvements en cours sont repris là où ils en sont : leur départ devient la valeur affichée.
    this.from.clear();
    for (const id of this.to.keys()) {
      this.from.set(id, this.value(id));
    }
    for (const [id, target] of set) {
      this.from.set(id, this.value(id));
      this.to.set(id, target);
    }
    for (const id of clear) {
      this.from.set(id, this.value(id));
      this.to.set(id, 0);
    }
    this.start = now;
  }

  get active(): boolean {
    return this.to.size > 0;
  }

  /** Nombre de tronçons en mouvement : au-delà d'un seuil, l'appelant préfère appliquer directement. */
  get size(): number {
    return this.to.size;
  }

  step(now: number): LoadStep {
    const progress = this.durationMs <= 0 ? 1 : easeOutCubic((now - this.start) / this.durationMs);
    const done = this.durationMs <= 0 || now - this.start >= this.durationMs;
    const set: [string, number][] = [];
    const clear: string[] = [];
    for (const [id, target] of this.to) {
      const value = done ? target : (this.from.get(id) ?? 0) + (target - (this.from.get(id) ?? 0)) * progress;
      const rounded = Math.round(value * 100) / 100;
      if (done && target === 0) {
        this.shown.delete(id);
        clear.push(id);
      } else {
        this.shown.set(id, rounded);
        set.push([id, rounded]);
      }
    }
    if (done) {
      this.to.clear();
      this.from.clear();
    }
    return { set, clear, active: this.active };
  }
}
