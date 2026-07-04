import { describe, expect, it } from 'vitest';
import { effectiveMinImportance, importanceOpacity, zoomThreshold } from './semanticZoom';
import { SEMANTIC_ZOOM } from './semanticZoom.config';
import type { SemanticZoomConfig } from './semanticZoom.config';

const config: SemanticZoomConfig = {
  curve: [
    { yearsPer1000px: 80, minImportance: 85 },
    { yearsPer1000px: 30, minImportance: 65 },
    { yearsPer1000px: 10, minImportance: 45 },
    { yearsPer1000px: 2, minImportance: 20 },
    { yearsPer1000px: 0.5, minImportance: 0 },
  ],
  thresholdBias: 0,
  fadeBand: 3,
};

describe('zoomThreshold', () => {
  it('clamps outside the curve at both ends', () => {
    expect(zoomThreshold(500, config)).toBe(85);
    expect(zoomThreshold(80, config)).toBe(85);
    expect(zoomThreshold(0.5, config)).toBe(0);
    expect(zoomThreshold(0.01, config)).toBe(0);
  });

  it('returns exact values at every control point', () => {
    for (const p of config.curve) {
      expect(zoomThreshold(p.yearsPer1000px, config)).toBeCloseTo(p.minImportance, 9);
    }
  });

  it('interpolates linearly in log space between control points', () => {
    // Geometric midpoint of 80 and 30 → arithmetic midpoint of 85 and 65.
    expect(zoomThreshold(Math.sqrt(80 * 30), config)).toBeCloseTo(75, 9);
    expect(zoomThreshold(Math.sqrt(10 * 2), config)).toBeCloseTo(32.5, 9);
  });

  it('is monotonically non-increasing as the user zooms in', () => {
    let prev = Infinity;
    for (let y = 200; y >= 0.1; y /= 1.2) {
      const t = zoomThreshold(y, config);
      expect(t).toBeLessThanOrEqual(prev + 1e-9);
      prev = t;
    }
  });

  it('applies thresholdBias and clamps the result to [0, 100]', () => {
    expect(zoomThreshold(80, { ...config, thresholdBias: 10 })).toBe(95);
    expect(zoomThreshold(80, { ...config, thresholdBias: 40 })).toBe(100);
    expect(zoomThreshold(0.5, { ...config, thresholdBias: -10 })).toBe(0);
  });

  it('the shipped config is sorted widest-first (interpolation precondition)', () => {
    const ys = SEMANTIC_ZOOM.curve.map((p) => p.yearsPer1000px);
    expect([...ys].sort((a, b) => b - a)).toEqual(ys);
  });
});

describe('effectiveMinImportance', () => {
  it('is the max of the zoom threshold and the user filter (docs/07)', () => {
    expect(effectiveMinImportance(45, 0)).toBe(45);
    expect(effectiveMinImportance(45, 60)).toBe(60);
    expect(effectiveMinImportance(85, 60)).toBe(85);
  });
});

describe('importanceOpacity', () => {
  it('is 1 at/above the floor and ramps to 0 across the fade band', () => {
    expect(importanceOpacity(50, 50, 3)).toBe(1);
    expect(importanceOpacity(80, 50, 3)).toBe(1);
    expect(importanceOpacity(49, 50, 3)).toBeCloseTo(2 / 3);
    expect(importanceOpacity(48, 50, 3)).toBeCloseTo(1 / 3);
    expect(importanceOpacity(47, 50, 3)).toBe(0);
    expect(importanceOpacity(20, 50, 3)).toBe(0);
  });

  it('degenerates to a hard cutoff when fadeBand is 0', () => {
    expect(importanceOpacity(50, 50, 0)).toBe(1);
    expect(importanceOpacity(49.99, 50, 0)).toBe(0);
  });
});
