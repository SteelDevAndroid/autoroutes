import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { buildAxisGroups } from '../map/axes';
import type { AxisGroup } from '../map/axes';
import type { StationCollection } from '../map/referentiel';
import { searchTargets } from './search';
import type { SearchResult } from './search';
import { Icon } from './Icon';

/** Recherche de gare (par nom) ou d'autoroute (« A7 »). Raccourci « / » (voir App) ; ↓ descend dans les résultats, Entrée ouvre le premier. */
export function SearchBox({ stations, onFocusStation, onFocusAxis }: {
  readonly stations: StationCollection;
  readonly onFocusStation: (index: number) => void;
  readonly onFocusAxis: (group: AxisGroup) => void;
}) {
  const [query, setQuery] = useState('');
  const list = useRef<HTMLUListElement>(null);
  const axes = useMemo(() => buildAxisGroups(stations), [stations]);
  const results = useMemo(() => searchTargets(stations, axes, query), [stations, axes, query]);

  const pick = (result: SearchResult) => {
    if (result.kind === 'axis') {
      onFocusAxis(result.group);
    } else {
      onFocusStation(result.index);
    }
    setQuery('');
  };
  const buttons = () => Array.from(list.current?.querySelectorAll('button') ?? []);

  const onInputKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      buttons()[0]?.focus();
    } else if (event.key === 'Enter' && results[0] !== undefined) {
      pick(results[0]);
    } else if (event.key === 'Escape') {
      setQuery('');
    }
  };
  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const all = buttons();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      all[Math.min(all.length - 1, at + 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (at <= 0) {
        document.getElementById('station-search')?.focus();
      } else {
        all[at - 1]?.focus();
      }
    } else if (event.key === 'Escape') {
      setQuery('');
      document.getElementById('station-search')?.focus();
    }
  };

  return (
    <section className="search" aria-label="Recherche de gare ou d’autoroute">
      <label className="search-label" htmlFor="station-search">Rechercher sur le réseau</label>
      <div className="search-field"><Icon name="search" />
      <input id="station-search" type="search" placeholder="Gare ou autoroute…" value={query} autoComplete="off"
        aria-label="Nom de gare ou d’autoroute" aria-keyshortcuts="/" onChange={(e) => { setQuery(e.target.value); }} onKeyDown={onInputKey} />
      <kbd aria-hidden="true">/</kbd></div>
      {query.trim().length >= 2 && results.length === 0 && <div className="empty-state" role="status"><strong>Aucun résultat pour « {query.trim()} ».</strong><p>Essayez un nom de gare ou un numéro d’autoroute, par exemple A7.</p><button className="icon-button" type="button" onClick={() => { setQuery(''); document.getElementById('station-search')?.focus(); }}>Effacer la recherche</button></div>}
      {results.length > 0 && (
        <ul ref={list} onKeyDown={onListKey} aria-label="Résultats de la recherche">
          {results.map((r) => (
            <li key={r.kind === 'axis' ? `axis-${r.id}` : `station-${r.index}`}>
              <button type="button" className="search-result" onClick={() => { pick(r); }}>
                <span className="search-name">{r.kind === 'axis' ? <><span className="axis-label axis-label-sample" aria-hidden="true">{r.id}</span> {r.id}</> : r.name}</span>
                <span className="search-detail">{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
