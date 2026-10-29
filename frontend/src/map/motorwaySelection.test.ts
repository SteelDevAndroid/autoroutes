import { describe, expect, it } from 'vitest';
import { selectedRoadIds } from './motorwaySelection';

describe('tracé de l’autoroute sélectionnée', () => {
  const features = [
    { id: 'a', properties: { ref: 'A 7; E 15' } },
    { id: 'b', properties: { ref: 'A71' } },
    { id: 'c', properties: { ref: 'a007, E714' } },
    { id: 'd', properties: { ref: 'A 6' } },
  ];

  it('normalise les codes du référentiel et les références OSM sans confondre A7 et A71', () => {
    expect([...selectedRoadIds(features, 'A0007,A0007N')]).toEqual(['a', 'c']);
    expect([...selectedRoadIds(features, 'A0071')]).toEqual(['b']);
  });
  it('remplace la sélection et la retire au retour à la vue d’ensemble', () => {
    expect([...selectedRoadIds(features, 'A0006')]).toEqual(['d']);
    expect(selectedRoadIds(features, null).size).toBe(0);
    expect(selectedRoadIds(features, '').size).toBe(0);
  });
  it('dédoublonne les tronçons partagés entre tuiles et ignore les références absentes', () => {
    expect([...selectedRoadIds([...features, ...features.slice(0, 1), { id: 'e', properties: {} }, { properties: { ref: 'A7' } }], 'A7')])
      .toEqual(['a', 'c']);
  });
});
