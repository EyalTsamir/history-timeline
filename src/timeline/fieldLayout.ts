/**
 * The event field layout (docs/14-ui-redesign.md §4) — replaces laneLayout.
 *
 * One field, events only (people → cast strip, works → shelf). Every event in
 * the culled input is ALWAYS represented: as a labeled mark (importance clears
 * the altitude's label floor and a row is found), inside a parent's chapter
 * band, or as a dot in the dot band. Overflow degrades to a dot — never to a
 * cluster chip, never to nothing (principle 2).
 *
 * - Labeled marks pack greedily into rows over label-aware PIXEL rects,
 *   most-important-first, so scarce rows always go to the weightiest items.
 * - CHAPTERS: at decade/year altitude, a labeled event whose descendants are
 *   in the set and whose span is wide enough becomes a container band with
 *   its children packed inside; collapsed chapters keep the most important
 *   children and expose the rest behind an in-place "עוד N" affordance
 *   (component state — expanding is never a zoom change).
 * - Vertical positions are ROW indices; the component owns row→px. Horizontal
 *   positions are px via scale, so no direction logic lives here.
 */
import type { EntityId } from '../domain/entities';
import type { TimelineItem } from '../domain/timelineItem';
import type { Altitude, ImportanceTier } from './altitude';
import { isLabeled, tierOf } from './altitude';
import type { PxRect, Scale } from './scale';
import { extendRectTowardLater, rectOf } from './scale';
import { layoutEnd } from './visibility';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface FieldConfig {
  /** Labeled-row budget — the hard bound on vertical growth. */
  maxRows: number;
  /** Horizontal gap enforced between boxes sharing a row. */
  minGapPx: number;
  /** Deterministic Hebrew label width estimate (no DOM measurement). */
  label: { charPx: number; basePx: number; minPx: number; maxPx: number };
  /** Seal/anchor labels render larger — extra px per character. */
  headlineCharBonusPx: number;
  /** Marker footprint per tier (diamond/medal diameter). */
  markerPx: Record<ImportanceTier, number>;
  /** Spans narrower than this render as point-style marks. */
  minBarPx: number;
  /** Bars at least this wide take their label inside the bar. */
  barInsideLabelMinPx: number;
  /** Chapter eligibility: minimum on-screen span width. Infinity disables. */
  chapterMinSpanPx: number;
  /** Child rows a collapsed / expanded chapter may use. */
  chapterCollapsedChildRows: number;
  chapterMaxChildRows: number;
  /** Dot-band sub-rows (deterministic jitter). */
  dotSubRows: number;
  /**
   * Dots landing in the same (subRow, ⌊x/bucket⌋) cell merge into one element
   * representing its weightiest item (docs/10 DOM bound at synthetic scale;
   * `count` carries the merged total for the accessible name).
   */
  dotBucketPx: number;
}

const MARKER_PX: Record<ImportanceTier, number> = {
  seal: 26,
  anchor: 16,
  major: 11,
  minor: 8,
  background: 7,
};

export const FIELD_CONFIGS: Record<Altitude, FieldConfig> = {
  century: {
    maxRows: 3,
    minGapPx: 10,
    label: { charPx: 7, basePx: 18, minPx: 40, maxPx: 220 },
    headlineCharBonusPx: 2,
    markerPx: MARKER_PX,
    minBarPx: 22,
    barInsideLabelMinPx: 72,
    chapterMinSpanPx: Number.POSITIVE_INFINITY, // no chapters at century altitude
    chapterCollapsedChildRows: 0,
    chapterMaxChildRows: 0,
    dotSubRows: 3,
    dotBucketPx: 5,
  },
  decade: {
    maxRows: 5,
    minGapPx: 8,
    label: { charPx: 7, basePx: 18, minPx: 40, maxPx: 200 },
    headlineCharBonusPx: 1,
    markerPx: MARKER_PX,
    minBarPx: 20,
    barInsideLabelMinPx: 64,
    chapterMinSpanPx: 90,
    chapterCollapsedChildRows: 2,
    chapterMaxChildRows: 4,
    dotSubRows: 3,
    dotBucketPx: 5,
  },
  year: {
    maxRows: 6,
    minGapPx: 8,
    label: { charPx: 7, basePx: 18, minPx: 40, maxPx: 200 },
    headlineCharBonusPx: 1,
    markerPx: MARKER_PX,
    minBarPx: 20,
    barInsideLabelMinPx: 64,
    chapterMinSpanPx: 110,
    chapterCollapsedChildRows: 2,
    chapterMaxChildRows: 5,
    dotSubRows: 3,
    dotBucketPx: 5,
  },
};

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export type MarkShape = 'seal' | 'bar' | 'point';

export interface FieldMark {
  item: TimelineItem;
  tier: ImportanceTier;
  shape: MarkShape;
  /** Absolute field row (0 = top). */
  row: number;
  /** Allocated interactive box, px. */
  x: number;
  width: number;
  /** True time-span rect (bar fill / seal underline). */
  spanX: number;
  spanWidth: number;
  /** point/seal: marker center x. */
  markerX?: number;
  /** Bar-inside labels: span∩viewport anchor (D14). Aside labels: the box. */
  labelX: number;
  labelWidth: number;
  labelInside: boolean;
  /** True for children rendered inside a chapter band (compact bead style). */
  inChapter: boolean;
}

export interface FieldChapter {
  item: TimelineItem;
  tier: ImportanceTier;
  /** Header row; the band occupies [row, row + rows). */
  row: number;
  rows: number;
  /** Container box covering the header label and every placed child. */
  x: number;
  width: number;
  /** True time-span rect of the chapter event itself. */
  spanX: number;
  spanWidth: number;
  /** Header label anchor, viewport-clamped (D14). */
  labelX: number;
  labelWidth: number;
  children: FieldMark[];
  /** Children folded behind the in-place "עוד N" affordance. */
  hiddenCount: number;
  expanded: boolean;
}

export interface FieldDot {
  /** The weightiest item of the bucket — the click/selection target. */
  item: TimelineItem;
  tier: ImportanceTier;
  /** Center x, clamped into the viewport for long spans. */
  x: number;
  subRow: number;
  /** Total items merged into this dot (1 = a plain single dot). */
  count: number;
}

export interface FieldLayout {
  marks: FieldMark[];
  chapters: FieldChapter[];
  dots: FieldDot[];
  /** Labeled rows in use (0 when everything is a dot). */
  rowsUsed: number;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function layoutField(
  items: readonly TimelineItem[],
  scale: Scale,
  altitude: Altitude,
  expandedChapterIds: ReadonlySet<EntityId>,
  openEndYear: number,
  config: FieldConfig = FIELD_CONFIGS[altitude],
): FieldLayout {
  const events = items.filter((i) => i.kind === 'event');
  const { topLevel, childrenByTop } = partitionByTopmost(events);

  const chapterHeads: TimelineItem[] = [];
  const plain: TimelineItem[] = [];
  for (const top of topLevel) {
    const kids = childrenByTop.get(top.id);
    if (kids !== undefined && isChapterEligible(top, scale, openEndYear, altitude, config)) {
      chapterHeads.push(top);
    } else {
      plain.push(top);
      if (kids !== undefined) plain.push(...kids); // judged independently
    }
  }

  const rows: PxRect[][] = [];
  const marks: FieldMark[] = [];
  const chapters: FieldChapter[] = [];
  const dotItems: TimelineItem[] = [];
  const labeledQueue = plain.filter((e) => isLabeled(e.importance, altitude)).sort(byWeight);
  dotItems.push(...plain.filter((e) => !isLabeled(e.importance, altitude)));

  // Chapters pack first (they are the largest and the most narrative-critical);
  // one that finds no room degrades to a plain mark + dots, never disappears.
  for (const head of [...chapterHeads].sort(byWeight)) {
    const kids = childrenByTop.get(head.id) ?? [];
    const built = buildChapter(head, kids, scale, openEndYear, expandedChapterIds.has(head.id), config);
    const row = placeBox(built.box, rows, built.chapter.rows, config);
    if (row >= 0) {
      built.chapter.row = row;
      for (const child of built.chapter.children) child.row += row + 1;
      chapters.push(built.chapter);
    } else {
      labeledQueue.push(head);
      for (const kid of kids) {
        if (isLabeled(kid.importance, altitude)) labeledQueue.push(kid);
        else dotItems.push(kid);
      }
      labeledQueue.sort(byWeight);
    }
  }

  for (const item of labeledQueue) {
    const mark = buildMark(item, scale, openEndYear, false, config);
    const row = placeBox({ x: mark.x, width: mark.width }, rows, 1, config);
    if (row >= 0) {
      mark.row = row;
      marks.push(mark);
    } else {
      dotItems.push(item);
    }
  }

  const dots = bucketDots(dotItems, scale, openEndYear, config);
  marks.sort(byTime);
  dots.sort(byTime);

  return { marks, chapters, dots, rowsUsed: rows.length };
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/**
 * Split events into top-level items and the descendants of an in-set ancestor
 * (deep nesting flattens into the topmost in-set ancestor). Shared by the
 * field layout and the mobile chronicle's chapter cards.
 */
export function partitionByTopmost(events: readonly TimelineItem[]): {
  topLevel: TimelineItem[];
  childrenByTop: Map<EntityId, TimelineItem[]>;
} {
  const byId = new Map(events.map((e) => [e.id, e]));
  const childrenByTop = new Map<EntityId, TimelineItem[]>();
  const topLevel: TimelineItem[] = [];
  for (const e of events) {
    const top = topmostInSet(e, byId);
    if (top === e.id) {
      topLevel.push(e);
    } else {
      const list = childrenByTop.get(top);
      if (list) list.push(e);
      else childrenByTop.set(top, [e]);
    }
  }
  return { topLevel, childrenByTop };
}

/** Walk parentIds up through the in-set events; returns the topmost in-set id. */
function topmostInSet(e: TimelineItem, byId: ReadonlyMap<EntityId, TimelineItem>): EntityId {
  let current = e;
  let hops = 0;
  while (current.parentId !== undefined && hops++ < 32) {
    const parent = byId.get(current.parentId);
    if (parent === undefined) break; // parent filtered out — this item stands alone
    current = parent;
  }
  return current.id;
}

function isChapterEligible(
  head: TimelineItem,
  scale: Scale,
  openEndYear: number,
  altitude: Altitude,
  config: FieldConfig,
): boolean {
  if (!isLabeled(head.importance, altitude)) return false;
  if (config.chapterCollapsedChildRows === 0) return false;
  const raw = rectOf(scale, head.start, layoutEnd(head, openEndYear));
  return raw.width >= config.chapterMinSpanPx;
}

/** Sort for packing: tier rank, importance desc, earlier start, id — deterministic. */
function byWeight(a: TimelineItem, b: TimelineItem): number {
  return b.importance - a.importance || a.start - b.start || a.id.localeCompare(b.id);
}

/** Render/DOM order: chronological, id tiebreak (stable tab order). */
function byTime(a: { item: TimelineItem }, b: { item: TimelineItem }): number {
  return a.item.start - b.item.start || a.item.id.localeCompare(b.item.id);
}

function labelPxOf(item: TimelineItem, tier: ImportanceTier, config: FieldConfig): number {
  const { charPx, basePx, minPx, maxPx } = config.label;
  const perChar = charPx + (tier === 'seal' || tier === 'anchor' ? config.headlineCharBonusPx : 0);
  return Math.min(maxPx, Math.max(minPx, item.title.length * perChar + basePx));
}

/** Clamp a box to the viewport for label anchoring (falls back to the box). */
function labelAnchor(box: PxRect, widthPx: number): PxRect {
  const lo = Math.max(box.x, 0);
  const hi = Math.min(box.x + box.width, widthPx);
  if (hi <= lo) return box; // fully in the pan buffer — not visible anyway
  return { x: lo, width: hi - lo };
}

/** Box + shape for one labeled event; `row` is assigned by the caller. */
function buildMark(
  item: TimelineItem,
  scale: Scale,
  openEndYear: number,
  inChapter: boolean,
  config: FieldConfig,
): FieldMark {
  const tier = tierOf(item.importance);
  const raw = rectOf(scale, item.start, layoutEnd(item, openEndYear));
  const labelPx = labelPxOf(item, tier, config);
  const markerPx = config.markerPx[tier];

  // Seals and narrow/point events: marker at the span center, label beside it
  // on the later-time side. The seal keeps its true span as an underline.
  if (tier === 'seal' || item.isPoint || raw.width < config.minBarPx) {
    const markerX = raw.x + raw.width / 2;
    const box = extendRectTowardLater(
      scale,
      { x: markerX - markerPx / 2, width: markerPx },
      markerPx + labelPx,
    );
    return {
      item, tier,
      shape: tier === 'seal' ? 'seal' : 'point',
      row: 0,
      x: box.x, width: box.width,
      spanX: raw.x, spanWidth: raw.width,
      markerX,
      labelX: box.x, labelWidth: box.width,
      labelInside: false,
      inChapter,
    };
  }

  // Span bar. Wide enough → label inside (viewport-clamped, D14); otherwise
  // the box extends toward later time and the label sits beside the bar.
  if (raw.width >= config.barInsideLabelMinPx) {
    const anchor = labelAnchor(raw, scale.widthPx);
    return {
      item, tier,
      shape: 'bar',
      row: 0,
      x: raw.x, width: raw.width,
      spanX: raw.x, spanWidth: raw.width,
      labelX: anchor.x, labelWidth: anchor.width,
      labelInside: true,
      inChapter,
    };
  }
  const box = extendRectTowardLater(scale, raw, raw.width + labelPx);
  return {
    item, tier,
    shape: 'bar',
    row: 0,
    x: box.x, width: box.width,
    spanX: raw.x, spanWidth: raw.width,
    labelX: box.x, labelWidth: box.width,
    labelInside: false,
    inChapter,
  };
}

interface BuiltChapter {
  chapter: FieldChapter;
  box: PxRect;
  placedRow: number;
}

function buildChapter(
  head: TimelineItem,
  kids: readonly TimelineItem[],
  scale: Scale,
  openEndYear: number,
  expanded: boolean,
  config: FieldConfig,
): BuiltChapter {
  const tier = tierOf(head.importance);
  const raw = rectOf(scale, head.start, layoutEnd(head, openEndYear));
  const headerLabelPx = labelPxOf(head, tier, config);
  const headerBox = extendRectTowardLater(scale, raw, Math.max(raw.width, headerLabelPx));

  // Children become compact beads packed into chapter-local rows, most
  // important first; the fold keeps the rest behind "עוד N".
  const rowBudget = expanded ? config.chapterMaxChildRows : config.chapterCollapsedChildRows;
  const childRows: PxRect[][] = [];
  const children: FieldMark[] = [];
  let hiddenCount = 0;
  for (const kid of [...kids].sort(byWeight)) {
    const bead = buildMark(kid, scale, openEndYear, true, config);
    const row = placeBox({ x: bead.x, width: bead.width }, childRows, 1, config, rowBudget);
    if (row >= 0) {
      bead.row = row; // chapter-local; offset after global placement
      children.push(bead);
    } else {
      hiddenCount += 1;
    }
  }

  let minX = headerBox.x;
  let maxX = headerBox.x + headerBox.width;
  for (const c of children) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x + c.width);
  }

  const rowsUsed = 1 + Math.max(1, childRows.length);
  const anchor = labelAnchor(headerBox, scale.widthPx);
  return {
    chapter: {
      item: head,
      tier,
      row: 0,
      rows: rowsUsed,
      x: minX,
      width: maxX - minX,
      spanX: raw.x,
      spanWidth: raw.width,
      labelX: anchor.x,
      labelWidth: anchor.width,
      children: children.sort(byTime),
      hiddenCount,
      expanded,
    },
    box: { x: minX, width: maxX - minX },
    placedRow: 0,
  };
}

function dotOf(item: TimelineItem, scale: Scale, openEndYear: number, config: FieldConfig): FieldDot {
  const end = layoutEnd(item, openEndYear);
  // Long spans crossing the window keep their dot on-screen: clamp the span
  // to the window before taking its midpoint.
  const lo = Math.max(item.start, scale.window.start);
  const hi = Math.min(end, scale.window.end);
  const mid = lo <= hi ? (lo + hi) / 2 : (item.start + end) / 2;
  const raw = rectOf(scale, mid, mid);
  return {
    item,
    tier: tierOf(item.importance),
    x: raw.x,
    subRow: idHash(item.id) % config.dotSubRows,
    count: 1,
  };
}

/**
 * Merge dots sharing a (subRow, x-bucket) cell into one element carrying the
 * weightiest item and the merged count — the density texture stays honest
 * while the DOM stays bounded by pixels, not by dataset size (docs/10).
 */
function bucketDots(
  items: readonly TimelineItem[],
  scale: Scale,
  openEndYear: number,
  config: FieldConfig,
): FieldDot[] {
  const buckets = new Map<string, FieldDot>();
  for (const item of items) {
    const dot = dotOf(item, scale, openEndYear, config);
    const key = `${dot.subRow}:${Math.round(dot.x / config.dotBucketPx)}`;
    const existing = buckets.get(key);
    if (existing === undefined) {
      buckets.set(key, dot);
    } else {
      existing.count += 1;
      if (byWeight(dot.item, existing.item) < 0) {
        existing.item = dot.item;
        existing.tier = dot.tier;
        existing.x = dot.x;
      }
    }
  }
  return [...buckets.values()];
}

/** Small deterministic string hash (dot sub-row jitter). */
function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

// ---------------------------------------------------------------------------
// Row packing (greedy first-fit over pixel rects)
// ---------------------------------------------------------------------------

/** First-fit placement; returns the row index, or -1 when nothing fits. */
function placeBox(
  box: PxRect,
  rows: PxRect[][],
  heightRows: number,
  config: FieldConfig,
  maxRows: number = config.maxRows,
): number {
  for (let row = 0; row + heightRows <= maxRows; row++) {
    if (fits(box, rows, row, heightRows, config.minGapPx)) {
      for (let r = row; r < row + heightRows; r++) {
        (rows[r] ??= []).push(box);
      }
      return row;
    }
  }
  return -1;
}

function fits(box: PxRect, rows: PxRect[][], fromRow: number, heightRows: number, gapPx: number): boolean {
  for (let r = fromRow; r < fromRow + heightRows; r++) {
    for (const other of rows[r] ?? []) {
      if (box.x - gapPx < other.x + other.width && other.x - gapPx < box.x + box.width) return false;
    }
  }
  return true;
}
