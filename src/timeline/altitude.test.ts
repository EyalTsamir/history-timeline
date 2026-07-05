import { describe, expect, it } from 'vitest';
import {
  ALTITUDE_CONFIG,
  LABEL_FLOORS,
  altitudeOf,
  canonicalSpan,
  isLabeled,
  stepAltitude,
  tierOf,
} from './altitude';

describe('altitudeOf', () => {
  it('maps spans to the three altitudes with the configured cutoffs', () => {
    expect(altitudeOf(73)).toBe('century');
    expect(altitudeOf(ALTITUDE_CONFIG.centuryMinSpan)).toBe('century');
    expect(altitudeOf(ALTITUDE_CONFIG.centuryMinSpan - 0.01)).toBe('decade');
    expect(altitudeOf(12)).toBe('decade');
    expect(altitudeOf(ALTITUDE_CONFIG.decadeMinSpan)).toBe('decade');
    expect(altitudeOf(ALTITUDE_CONFIG.decadeMinSpan - 0.01)).toBe('year');
    expect(altitudeOf(2)).toBe('year');
  });

  it('canonical spans re-derive their own altitude (stepping is stable)', () => {
    const defaultSpan = 73;
    expect(altitudeOf(canonicalSpan('century', defaultSpan))).toBe('century');
    expect(altitudeOf(canonicalSpan('decade', defaultSpan))).toBe('decade');
    expect(altitudeOf(canonicalSpan('year', defaultSpan))).toBe('year');
  });
});

describe('stepAltitude', () => {
  it('dives century → decade → year and clamps at year', () => {
    expect(stepAltitude('century', 1)).toBe('decade');
    expect(stepAltitude('decade', 1)).toBe('year');
    expect(stepAltitude('year', 1)).toBe('year');
  });

  it('climbs year → decade → century and clamps at century', () => {
    expect(stepAltitude('year', -1)).toBe('decade');
    expect(stepAltitude('decade', -1)).toBe('century');
    expect(stepAltitude('century', -1)).toBe('century');
  });
});

describe('tiers and label floors', () => {
  it('maps importance to tiers at the documented bounds', () => {
    expect(tierOf(100)).toBe('seal');
    expect(tierOf(95)).toBe('seal');
    expect(tierOf(94)).toBe('anchor');
    expect(tierOf(80)).toBe('anchor');
    expect(tierOf(79)).toBe('major');
    expect(tierOf(55)).toBe('major');
    expect(tierOf(54)).toBe('minor');
    expect(tierOf(30)).toBe('minor');
    expect(tierOf(29)).toBe('background');
    expect(tierOf(1)).toBe('background');
  });

  it('label floors narrow as you dive; year altitude labels everything', () => {
    expect(LABEL_FLOORS.century).toBeGreaterThan(LABEL_FLOORS.decade);
    expect(LABEL_FLOORS.decade).toBeGreaterThan(LABEL_FLOORS.year);
    expect(isLabeled(80, 'century')).toBe(true);
    expect(isLabeled(79, 'century')).toBe(false);
    expect(isLabeled(45, 'decade')).toBe(true);
    expect(isLabeled(44, 'decade')).toBe(false);
    expect(isLabeled(1, 'year')).toBe(true);
  });
});
