import { theme } from '../map/theme';
import { useUiStore } from '../state/uiStore';
import { Section } from './Section';
import { legendRows } from './legend';

/** Légende contextuelle : une ligne par couche affichée, avec la nature (observé ou estimé) de ce qu'elle montre. */
export function Legend() {
  const layers = useUiStore((s) => s.layers);
  const kinds = useUiStore((s) => s.kinds);
  const rows = legendRows(layers, { echangeur: kinds.has('ECHANGEUR'), pleineVoie: kinds.has('PLEINE_VOIE') });
  return (
    <Section id="legend" title="Légende">
      {rows.length === 0 && <p className="note">Aucune couche affichée.</p>}
      {rows.includes('echangeur') && <div className="legend-row"><span className="swatch" style={{ background: theme.stationEchangeur }} /> Gare d’échangeur</div>}
      {rows.includes('pleine-voie') && <div className="legend-row"><span className="swatch" style={{ background: theme.stationPleineVoie, outline: '2px solid #e6edf3' }} /> Barrière pleine voie</div>}
      {rows.includes('stale') && <div className="legend-row"><span className="swatch" style={{ background: theme.stationStale }} /> Gare sans données récentes</div>}
      {layers.stations && <p className="note">Observé : surface du cercle ∝ passages sur 1 h. Halo bref = nouveaux passages.</p>}
      {rows.includes('axes') && <div className="legend-row"><span className="axis-label axis-label-sample" aria-hidden="true">A7</span> Nom d’autoroute : survol = ses gares, clic = filtre « Axe » des flux</div>}
      {rows.includes('od') && <div className="legend-row"><span className="swatch-line" style={{ borderColor: theme.odFlow }} /> Flux O/D observé (≥ 3 véh. sur 1 h), clair → foncé = origine → destination</div>}
      {rows.includes('segments') && <div className="legend-row"><span className="swatch-line swatch-dashed" style={{ borderColor: theme.segmentRamp[3] }} /> Charge de tronçon <strong>estimée</strong></div>}
      {(layers.od || layers.segments) && <p className="note">Données de péage : le trafic gratuit et les trajets entre deux gares ne sont pas mesurés.</p>}
    </Section>
  );
}
