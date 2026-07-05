/**
 * The historical date model (docs/03-domain-model.md#the-date-model).
 *
 * Dates are authored as precision-carrying strings — "1948" | "1948-05" |
 * "1948-05-14" — and converted to decimal years for all layout/zoom math.
 * Precision is preserved for display: a year-only date renders as "1948",
 * never a fabricated "1 בינואר 1948".
 */

/** Authored form: "YYYY" | "YYYY-MM" | "YYYY-MM-DD" (Gregorian). */
export type HistDate = string;

export type DatePrecision = 'year' | 'month' | 'day';

export interface ParsedHistDate {
  year: number;
  month?: number;
  day?: number;
  precision: DatePrecision;
}

export interface DateRange {
  start: HistDate;
  /** omitted/undefined → point-in-time; null → open/ongoing (e.g. a living person). */
  end?: HistDate | null | undefined;
  /** circa — rendered with a ≈ affordance. */
  approx?: boolean | undefined;
}

export type RangeKind = 'point' | 'closed' | 'open';

/** Inclusive lower / exclusive upper bounds in decimal years; end null = ongoing. */
export interface TimeSpan {
  start: number;
  end: number | null;
}

const HIST_DATE_RE = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const table = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return table[month - 1]!;
}

function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

function dayOfYear(year: number, month: number, day: number): number {
  let doy = day;
  for (let m = 1; m < month; m++) doy += daysInMonth(year, m);
  return doy;
}

export function isValidHistDate(value: string): boolean {
  const m = HIST_DATE_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  if (m[2] !== undefined) {
    const month = Number(m[2]);
    if (month < 1 || month > 12) return false;
    if (m[3] !== undefined) {
      const day = Number(m[3]);
      if (day < 1 || day > daysInMonth(year, month)) return false;
    }
  } else if (m[3] !== undefined) {
    return false; // day without month is unrepresentable in the regex, defensive
  }
  return true;
}

export function parseHistDate(value: string): ParsedHistDate {
  if (!isValidHistDate(value)) {
    throw new Error(`Invalid HistDate "${value}" — expected "YYYY" | "YYYY-MM" | "YYYY-MM-DD" with a real calendar date`);
  }
  const m = HIST_DATE_RE.exec(value)!;
  const year = Number(m[1]);
  if (m[2] === undefined) return { year, precision: 'year' };
  const month = Number(m[2]);
  if (m[3] === undefined) return { year, month, precision: 'month' };
  return { year, month, day: Number(m[3]), precision: 'day' };
}

/**
 * Convert a HistDate to a decimal year.
 * edge 'start' → the inclusive beginning of the period the date denotes;
 * edge 'end'   → the exclusive end of that period.
 * E.g. "1948" → [1948.0, 1949.0), "1948-05-14" → a ~0.0027-year sliver.
 */
export function toDecimalYear(value: HistDate, edge: 'start' | 'end'): number {
  const { year, month, day, precision } = parseHistDate(value);
  if (precision === 'year') {
    return edge === 'start' ? year : year + 1;
  }
  if (precision === 'month') {
    if (edge === 'start') {
      const doy = dayOfYear(year, month!, 1);
      return year + (doy - 1) / daysInYear(year);
    }
    return month === 12 ? year + 1 : toDecimalYear(`${year}-${String(month! + 1).padStart(2, '0')}`, 'start');
  }
  const doy = dayOfYear(year, month!, day!);
  return edge === 'start' ? year + (doy - 1) / daysInYear(year) : year + doy / daysInYear(year);
}

export function compareHistDates(a: HistDate, b: HistDate): number {
  return toDecimalYear(a, 'start') - toDecimalYear(b, 'start');
}

export function rangeKind(range: DateRange): RangeKind {
  if (range.end === undefined) return 'point';
  if (range.end === null) return 'open';
  return 'closed';
}

/** Is the range well-ordered? (others than closed always are.) */
export function isValidRangeOrder(range: DateRange): boolean {
  if (rangeKind(range) !== 'closed') return true;
  // A closed range is valid iff its projected span has positive width — the
  // start period begins before the end period finishes. This keeps mixed
  // precision legal in both directions ({start:"1948", end:"1948-05"} and
  // {start:"1948-05-14", end:"1948"}) while rejecting true reversals.
  return toDecimalYear(range.start, 'start') < toDecimalYear(range.end as HistDate, 'end');
}

/** Project a DateRange onto the decimal-year axis. */
export function spanOf(range: DateRange): TimeSpan {
  const kind = rangeKind(range);
  const start = toDecimalYear(range.start, 'start');
  if (kind === 'point') return { start, end: toDecimalYear(range.start, 'end') };
  if (kind === 'open') return { start, end: null };
  return { start, end: toDecimalYear(range.end as HistDate, 'end') };
}

/**
 * "Now" as a decimal year — the visual clamp for open-ended spans (a living
 * person's line runs to today). Injectable clock for tests.
 */
export function currentDecimalYear(now: Date = new Date()): number {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return toDecimalYear(`${y}-${m}-${d}`, 'start');
}

// ---------------------------------------------------------------------------
// Hebrew display formatting
// ---------------------------------------------------------------------------

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
] as const;

/** Hebrew month name, 1-based. Shared with the timeline ruler labels. */
export function hebrewMonthName(month: number): string {
  const name = HEBREW_MONTHS[month - 1];
  if (name === undefined) throw new Error(`month out of range: ${month}`);
  return name;
}

/**
 * Inverse of toDecimalYear at month granularity: which calendar (year, month)
 * does a decimal-year instant fall in? Exact against real month lengths —
 * used by the ruler, so tick labels never drift off their gridline.
 */
export function decimalYearToYearMonth(t: number): { year: number; month: number } {
  const year = Math.floor(t);
  const dayIndex = (t - year) * daysInYear(year); // 0-based day-of-year, fractional
  let remaining = dayIndex;
  for (let month = 1; month <= 12; month++) {
    const len = daysInMonth(year, month);
    // EPS guards float round-trip underflow: an exact month-start produced by
    // toDecimalYear lands microscopically below its integer day-index (e.g.
    // 30.9999999999 for Feb 1), which without the tolerance returns the PREVIOUS
    // month. The error is ~1e-13 day; 1e-6 is a safe margin that never
    // mis-buckets a genuine mid-month instant.
    if (remaining < len - 1e-6) return { year, month };
    remaining -= len;
  }
  return { year, month: 12 }; // t at the very edge of the year
}

/** "1948" | "מאי 1948" | "14 במאי 1948" — precision-aware, never fabricates detail. */
export function formatHistDate(value: HistDate): string {
  const { year, month, day, precision } = parseHistDate(value);
  if (precision === 'year') return String(year);
  const monthName = HEBREW_MONTHS[month! - 1]!;
  if (precision === 'month') return `${monthName} ${year}`;
  return `${day} ב${monthName} ${year}`;
}

/**
 * Format a full range for display: "1948" | "1936–1939" | "מאי 1948 – יולי 1949" | "1954–".
 * approx prefixes ≈. The en dash gets surrounding spaces only when either side
 * contains a space itself (bidi-safer and easier to read with month names).
 */
export function formatDateRange(range: DateRange): string {
  const approx = range.approx ? '≈' : '';
  const kind = rangeKind(range);
  const startText = formatHistDate(range.start);
  if (kind === 'point') return approx + startText;
  if (kind === 'open') return `${approx}${startText}–`;
  const endText = formatHistDate(range.end as HistDate);
  if (endText === startText) return approx + startText;
  const dash = startText.includes(' ') || endText.includes(' ') ? ' – ' : '–';
  return `${approx}${startText}${dash}${endText}`;
}
