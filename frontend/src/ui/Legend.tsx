import { themeFor } from '../map/theme';
import { useUiStore } from '../state/uiStore';
import { Section } from './Section';
import { formatCount } from './format';
import { legendRows, segmentScale } from './legendModel';
import { trafficMotionMessage, trafficMotionState } from '../animation/trafficMotion';

/** Légende contextuelle : une ligne par couche affichée, avec la nature (observé ou estimé) de ce qu'elle montre. */
export function Legend() {
  const mode = useUiStore((s) => s.mode);
  const motionState = useUiStore(trafficMotionState);
  const layers = useUiStore((s) => s.layers);
  const theme = themeFor(useUiStore((s) => s.palette));
  const kinds = useUiStore((s) => s.kinds);
  const segments = useUiStore((s) => s.segments);
  const reference = useUiStore((s) => s.segmentReference);
  const scale = segmentScale(segments?.loads ?? [], reference);
  const rows = legendRows(layers, { echangeur: kinds.has('ECHANGEUR'), pleineVoie: kinds.has('PLEINE_VOIE') });
  return (
    <Section id="legend" title="Légende">
      {rows.length === 0 && <p className="note">Aucune couche affichée.</p>}
      {rows.includes('echangeur') && <div className="legend-row"><span className="swatch" style={{ background: theme.stationEchangeur }} /> Gare d’échangeur</div>}
      {rows.includes('pleine-voie') && <div className="legend-row"><span className="swatch" style={{ background: theme.stationPleineVoie, outline: '2px solid #e6edf3' }} /> Barrière pleine voie</div>}
      {rows.includes('stale') && <div className="legend-row"><span className="swatch" style={{ background: theme.stationStale }} /> Gare sans données récentes</div>}
      {layers.stations && <p className="note">Activité : surface du cercle ∝ passages sur 1 h. Halo bref = nouveaux passages.</p>}
      {layers.stations && mode === 'live' && <div className="legend-row"><span className="anomaly-swatch" aria-hidden="true" /> Contour extérieur : anomalies signalées. Criticité et nombre au survol ou dans la fiche.</div>}
      {rows.includes('axes') && <div className="legend-row"><span className="axis-label axis-label-sample" aria-hidden="true">A7</span> Nom d’autoroute : survol = ses gares, clic = filtre « Axe » des flux</div>}
      {rows.includes('od') && <div className="legend-row"><span className="swatch-line" style={{ borderColor: theme.odFlow }} /> Flux O/D reçu (≥ 3 véh. sur 1 h), clair → foncé = origine → destination</div>}
      {rows.includes('od') && <p className="note">Flux entre gares de l’axe sélectionné : tirets plus rapprochés = volume plus élevé. Leur vitesse est illustrative et constante.</p>}
      {rows.includes('od') && <p className="note">Vue nationale statique ; zoomez pour voir les flux moyens et forts en mouvement, puis les petits flux en vue locale.</p>}
      {rows.includes('od') && trafficMotionMessage[motionState] !== null && <p className="note">{trafficMotionMessage[motionState]}</p>}
      {rows.includes('od') && <p className="note">Tracés routiers : itinéraires estimés. Sans tracé disponible, les arcs courbes représentent des liaisons schématiques.</p>}
      {rows.includes('segments') && (
        <div className="legend-scale" data-testid="segment-scale">
          <div className="legend-row"><span className="swatch-line swatch-dashed" style={{ borderColor: theme.segmentRamp[3] }} /> Charge de tronçon <strong>estimée</strong>, sur 1 h</div>
          <div className="scale-bar" aria-hidden="true" style={{ background: `linear-gradient(to right, ${theme.segmentRamp.join(', ')})` }} />
          {scale === null
            ? <p className="note">Échelle disponible à la première estimation.</p>
            : (
              <>
                <div className="scale-ticks" aria-hidden="true">{scale.ticks.map((t, i) => <span key={i}>{i === scale.ticks.length - 1 ? `≥ ${formatCount(t)}` : formatCount(t)}</span>)}</div>
                <p className="note">Véhicules par tronçon et par heure ; échelle de couleur stable pour comparer les mises à jour. Tirets sur la carte : estimation.</p>
              </>
            )}
        </div>
      )}
      {(layers.od || layers.segments) && <p className="note">Données de péage : le trafic gratuit et les trajets entre deux gares ne sont pas mesurés.</p>}
    </Section>
  );
}
