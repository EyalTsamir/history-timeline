/**
 * Adaptive time-ruler gradations (docs/spec/rendering.md#axis--labels):
 * decades → years → months, chosen so labeled ticks keep a readable pixel
 * spacing at any zoom. Pure — the component maps tick times to x via scale.
 */
import { decimalYearToYearMonth, hebrewMonthName, toDecimalYear } from '../domain/dates';
import type { TimeWindow } from './scale';
import { spanYears } from './scale';

export interface Tick {
  /** Decimal-year position of the gridline. */
  t: number;
  label: string;
  /** Stronger gridline + label (decade years, January of month ticks). */
  major: boolean;
}

/** Year-unit ladder, coarse → fine; below 1 year the ruler switches to months. */
const YEAR_STEPS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;
const MONTH_STEPS = [6, 3, 1] as const;

/** Minimum px between labeled ticks; month labels carry a year so need more. */
const MIN_TICK_PX = 72;
const MIN_MONTH_TICK_PX = 96;

/** The finest step (last in the ladder) whose ticks still keep minPx spacing. */
function finestFitting(steps: readonly number[], stepPx: (step: number) => number, minPx: number): number | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!;
    if (stepPx(step) >= minPx) return step;
  }
  return undefined;
}

/**
 * Generate ticks covering `cover` (defaults to `window`) at a density chosen
 * from window/widthPx. `cover` lets the component extend ticks across the
 * pan buffer so gridlines already exist when the layer slides.
 */
export function generateTicks(window: TimeWindow, widthPx: number, cover: TimeWindow = window): Tick[] {
  const ppy = widthPx / spanYears(window);
  const yearStep = finestFitting(YEAR_STEPS, (s) => s * ppy, MIN_TICK_PX) ?? YEAR_STEPS[0];
  if (yearStep === 1) {
    const monthStep = finestFitting(MONTH_STEPS, (s) => (s / 12) * ppy, MIN_MONTH_TICK_PX);
    if (monthStep !== undefined) return monthTicks(monthStep, cover);
  }
  return yearTicks(yearStep, cover);
}

function yearTicks(step: number, cover: TimeWindow): Tick[] {
  const ticks: Tick[] = [];
  const first = Math.ceil(cover.start / step) * step;
  // Major emphasis one ladder level up (decades over years, centuries over 20s…).
  const majorEvery = step < 10 ? 10 : step * 5;
  for (let y = first; y <= cover.end; y += step) {
    ticks.push({ t: y, label: String(y), major: y % majorEvery === 0 });
  }
  return ticks;
}

function monthTicks(stepMonths: number, cover: TimeWindow): Tick[] {
  const ticks: Tick[] = [];
  const from = decimalYearToYearMonth(cover.start);
  let year = from.year;
  // Align to the step grid (Jan/Apr/Jul/Oct for 3, Jan/Jul for 6).
  let month = Math.floor((from.month - 1) / stepMonths) * stepMonths + 1;
  for (;;) {
    const t = toDecimalYear(`${year}-${String(month).padStart(2, '0')}`, 'start');
    if (t > cover.end) break;
    if (t >= cover.start) {
      ticks.push({ t, label: `${hebrewMonthName(month)} ${year}`, major: month === 1 });
    }
    month += stepMonths;
    if (month > 12) {
      month -= 12;
      year += 1;
    }
  }
  return ticks;
}

/**
 * Human-readable summary of the visible range for the ruler readout — the
 * "where am I" answer that must always be available (docs/spec/interaction.md). Year precision
 * on wide views, month precision when zoomed under ~3 years.
 */
export function formatWindowRange(window: TimeWindow): string {
  if (spanYears(window) >= 3) {
    const a = Math.floor(window.start);
    const b = Math.floor(window.end);
    return a === b ? String(a) : `${a}–${b}`;
  }
  const from = decimalYearToYearMonth(window.start);
  const to = decimalYearToYearMonth(window.end);
  const fromText = `${hebrewMonthName(from.month)} ${from.year}`;
  const toText = `${hebrewMonthName(to.month)} ${to.year}`;
  return fromText === toText ? fromText : `${fromText} – ${toText}`;
}
