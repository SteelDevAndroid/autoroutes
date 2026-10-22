import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from './uiStore';

describe('uiStore sections', () => {
  beforeEach(() => { useUiStore.setState(useUiStore.getInitialState(), true); });

  it('starts with the layers section open', () => {
    expect(useUiStore.getState().openSection).toBe('layers');
  });

  it('opens the settings of a layer when it is switched on, and keeps the section when it is switched off', () => {
    useUiStore.getState().toggleLayer('od');
    expect(useUiStore.getState().openSection).toBe('od');
    useUiStore.getState().toggleLayer('segments');
    expect(useUiStore.getState().openSection).toBe('segments');

    useUiStore.getState().toggleLayer('segments');

    expect(useUiStore.getState().layers.segments).toBe(false);
    expect(useUiStore.getState().openSection).toBe('segments');
  });

  it('does not steal the focus for layers without a section of their own', () => {
    useUiStore.getState().toggleLayer('labels');

    expect(useUiStore.getState().openSection).toBe('layers');
  });

  it('hides internal flows until asked', () => {
    expect(useUiStore.getState().odIncludeInternal).toBe(false);
  });
});
