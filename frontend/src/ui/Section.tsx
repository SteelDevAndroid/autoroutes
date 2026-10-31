import type { ReactNode } from 'react';
import { useUiStore } from '../state/uiStore';
import type { SectionId } from '../state/uiStore';
import { GlassCard } from './Spatial';
import { Icon } from './Icon';

/**
 * Section repliable du panneau latéral. Une seule est ouverte à la fois : le panneau garde la hauteur de l'écran
 * quel que soit le nombre de couches actives. Le contenu fermé reste dans le DOM mais replié (état conservé).
 */
export function Section({ id, title, label, badge, children }: {
  readonly id: SectionId;
  readonly title: string;
  /** Nom accessible de la région, si différent du titre. */
  readonly label?: string;
  readonly badge?: ReactNode;
  readonly children: ReactNode;
}) {
  const open = useUiStore((s) => s.openSection === id);
  const setOpen = useUiStore((s) => s.setOpenSection);
  return (
    <GlassCard className="panel-section" aria-label={label ?? title}>
      <h2>
        <button type="button" className="section-toggle" aria-expanded={open} aria-controls={`section-${id}`}
          onClick={() => { setOpen(open ? null : id); }}>
          <Icon name="chevron" className={`section-chevron${open ? ' rotated' : ''}`} />
          <span className="section-title">{title}</span>
          {badge}
        </button>
      </h2>
      {/* Contenu toujours monté (état conservé), replié par la hauteur ; `inert` le retire du clavier et des lecteurs d'écran. */}
      <div id={`section-${id}`} className={`section-body${open ? ' section-open' : ''}`} inert={!open}>
        <div className="section-inner">{children}</div>
      </div>
    </GlassCard>
  );
}
