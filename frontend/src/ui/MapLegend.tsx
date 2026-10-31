import { useRef, useState } from 'react';
import { themeFor } from '../map/theme';
import { useUiStore } from '../state/uiStore';
import { GlassPanel } from './Spatial';
import { Icon } from './Icon';
import { LegendContent } from './Legend';
import { legendRows } from './legendModel';

/** Repères de lecture immédiats ; les explications complètes se déplient à la demande. */
export function MapLegend() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const layers = useUiStore((s) => s.layers);
  const kinds = useUiStore((s) => s.kinds);
  const palette = useUiStore((s) => s.palette);
  const mode = useUiStore((s) => s.mode);
  const selected = useUiStore((s) => s.selectedIndex);
  const diagnostic = useUiStore((s) => s.diagnosticOpen);
  const theme = themeFor(palette);
  const rows = legendRows(layers, { echangeur: kinds.has('ECHANGEUR'), pleineVoie: kinds.has('PLEINE_VOIE') });
  // La fiche et le diagnostic ont la priorité ; la légende du panneau reste disponible.
  if (selected !== null || diagnostic) return null;
  return <GlassPanel material="regular" className={`map-legend${mode === 'replay' ? ' map-legend-replay' : ''}`} aria-label="Légende de la carte"
    onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    }}>
    <button ref={button} type="button" className="map-legend-toggle" aria-expanded={open} aria-controls="map-legend-content"
      onClick={() => { setOpen(!open); }}><Icon name="help" /><span>Légende de la carte</span><Icon name="chevron" className={open ? 'rotated' : ''} /></button>
    <div className="map-legend-content" tabIndex={open ? 0 : undefined}>
      <div id="map-legend-content" hidden={!open}>{open && <LegendContent location="map" />}</div>
      {!open && <>
        {rows.length === 0 ? <p className="note">Aucune couche affichée.</p> : <ul className="compact-legend-items">
          {rows.includes('echangeur') && <li><span className="swatch" style={{ background: theme.stationEchangeur }} aria-hidden="true" />Échangeurs</li>}
          {rows.includes('pleine-voie') && <li><span className="swatch" style={{ background: theme.stationPleineVoie, outline: '1px solid #e6edf3' }} aria-hidden="true" />Barrières</li>}
          {rows.includes('stale') && <li><span className="swatch" style={{ background: theme.stationStale }} aria-hidden="true" />Sans données récentes</li>}
          {layers.stations && mode === 'live' && <li><span className="anomaly-swatch" aria-hidden="true" />Anomalies</li>}
          {rows.includes('axes') && <li><span className="axis-label axis-label-sample" aria-hidden="true">A7</span>Axes</li>}
          {rows.includes('od') && <li><span className="swatch-line" style={{ borderColor: theme.odFlow }} aria-hidden="true" />Flux O/D ≥ 3 véh./h</li>}
          {rows.includes('segments') && <li><span className="swatch-line swatch-dashed" style={{ borderColor: theme.segmentRamp[3] }} aria-hidden="true" />Tronçons estimés</li>}
        </ul>}
        {layers.stations && <p className="note">Surface des cercles : passages sur 1 h.</p>}
        {layers.od && <p className="note">Tirets : volume des flux, vitesse illustrative.</p>}
      </>}
    </div>
  </GlassPanel>;
}
