import { afterEach, describe, expect, it } from 'vitest';
import {
  applyFoldableLayout,
  clearFoldableLayout,
  type FoldableLayout,
} from '../lib/foldable-layout.js';

const verticalFold: FoldableLayout = {
  hasFold: true,
  isSeparating: true,
  orientation: 'vertical',
  state: 'half-opened',
  occlusion: 'full',
  bounds: { left: 900, top: 0, right: 930, bottom: 1800 },
};

describe('foldable layout bridge', () => {
  afterEach(() => clearFoldableLayout());

  it('converts native pixels into CSS hinge variables', () => {
    applyFoldableLayout(verticalFold, document.documentElement, 2);

    expect(document.documentElement.dataset.foldOrientation).toBe('vertical');
    expect(document.documentElement.dataset.foldSeparating).toBe('true');
    expect(document.documentElement.style.getPropertyValue('--fold-left')).toBe('450px');
    expect(document.documentElement.style.getPropertyValue('--fold-width')).toBe('15px');
  });

  it('clears hinge constraints when the window is no longer separating', () => {
    applyFoldableLayout(verticalFold, document.documentElement, 2);
    applyFoldableLayout(
      { ...verticalFold, hasFold: false, isSeparating: false, orientation: 'none' },
      document.documentElement,
      2
    );

    expect(document.documentElement.dataset.foldOrientation).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue('--fold-left')).toBe('');
  });
});
