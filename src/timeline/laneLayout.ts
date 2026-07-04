/**
 * Lane layout (docs/06-timeline-rendering.md#lanes-and-vertical-layout):
 * the culled visible set → deterministic positioned rectangles.
 *
 * - Three fixed bands by kind: events, people, works.
 * - Within a band, greedy first-fit interval packing into rows over PIXEL
 *   rects (label-aware), so what cannot collide on screen cannot collide.
 * - Events with visible children become CONTAINERS: a labeled span one row
 *   tall with its children packed into the rows beneath it (deeper
 *   descendants flatten into the topmost visible ancestor's container).
 * - Two growth bounds (docs/05 density cap): a per-band item budget scaled
 *   by width, and a row budget. Overflow collapses into cluster chips
 *   ("+N נוספים") placed on their own row; tapping one zooms to its span.
 *
 * Vertical positions are ROW indices; the component owns row→px. All
 * horizontal positions are px via scale, so no direction logic lives here.
 */
import type { EntityId } from '../domain/entities';
import type { TimelineItem, TimelineKind } from '../domain/timelineItem';
import type { PxRect, Scale } from './scale';
import { extendRectTowardLater, rectOf, xOf } from './scale';
import type { VisibleItem } from './visibility';
import { layoutEnd } from './visibility';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface BandConfig {
  /** Row budget — the hard bound on vertical growth. */
  maxRows: number;
  /** Density cap: max top-level units per 1000 px of viewport (docs/05). */
  maxItemsPer1000px: number;
  /** Events only: rows available inside a container for its children. */
  maxContainerChildRows: number;
}

export interface LayoutConfig {
  bands: Record<TimelineKind, BandConfig>;
  /** Horizontal gap enforced between rects sharing a row. */
  minGapPx: number;
  /** Overflow items whose boxes are closer than this merge into one cluster. */
  clusterJoinPx: number;
  /** Deterministic Hebrew label width estimate (no DOM measurement). */
  label: { charPx: number; basePx: number; minPx: number; maxPx: number };
  /** Marker footprint of a point item. */
  pointMarkerPx: number;
  /** Span bars narrower than this get their label beside, not inside. */
  labelAsideBelowPx: number;
  /** Minimum drawn width of any span rect. */
  minSpanPx: number;
  /** Cluster chip footprint. */
  clusterChipPx: number;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  bands: {
    event: { maxRows: 5, maxItemsPer1000px: 8, maxContainerChildRows: 3 },
    person: { maxRows: 5, maxItemsPer1000px: 8, maxContainerChildRows: 0 },
    work: { maxRows: 4, maxItemsPer1000px: 8, maxContainerChildRows: 0 },
  },
  minGapPx: 8,
  clusterJoinPx: 48,
  label: { charPx: 7, basePx: 18, minPx: 40, maxPx: 200 },
  pointMarkerPx: 16,
  labelAsideBelowPx: 56,
  minSpanPx: 14,
  clusterChipPx: 76,
};

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export type LabelPlacement = 'inside' | 'aside' | 'above';

export interface PositionedItem {
  item: TimelineItem;
  opacity: number;
  /** Allocated (label-aware) box, px. */
  x: number;
  width: number;
  /** The true time-span rect inside the box, px. */
  spanX: number;
  spanWidth: number;
  /** Point items: marker center x. */
  markerX?: number;
  /**
   * Label anchor box for 'inside'/'above' labels: the box clamped to the
   * viewport [0, widthPx], so a span reaching off-screen still shows its
   * name in the visible part (re-clamped on every relayout).
   */
  labelX: number;
  labelWidth: number;
  /** Band-local row (0 = top). Containers occupy [row, row+heightRows). */
  row: number;
  heightRows: number;
  isContainer: boolean;
  labelPlacement: LabelPlacement;
  /** True when end is open (living person) — render a fade-out edge, never an end date. */
  openEnded: boolean;
}

export interface PositionedCluster {
  /** Collapsed item ids, most important first. */
  ids: EntityId[];
  x: number;
  width: number;
  row: number;
  /** Time span covered — the zoom-to-fit target. */
  start: number;
  end: number;
}

export interface BandLayout {
  kind: TimelineKind;
  items: PositionedItem[];
  clusters: PositionedCluster[];
  /** Total rows in use (≥ 1), including the cluster row when present. */
  rows: number;
}

export interface TimelineLayout {
  bands: BandLayout[];
}

export const BAND_ORDER: readonly TimelineKind[] = ['event', 'person', 'work'];

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function layoutTimeline(
  visible: readonly VisibleItem[],
  scale: Scale,
  openEndYear: number,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG,
): TimelineLayout {
  const byKind = new Map<TimelineKind, VisibleItem[]>(BAND_ORDER.map((k) => [k, []]));
  for (const v of visible) byKind.get(v.item.kind)?.push(v);
  return {
    bands: BAND_ORDER.map((kind) => layoutBand(kind, byKind.get(kind) ?? [], scale, openEndYear, config)),
  };
}

/** A packable unit: a plain item box or a container block with its children. */
interface Unit {
  head: VisibleItem;
  box: PxRect;
  heightRows: number;
  positioned: PositionedItem; // row assigned after packing
  children: PositionedItem[]; // container-local rows, offset after packing
  /** All ids the unit carries (head + descendants) — cluster bookkeeping. */
  ids: EntityId[];
  /** Overall time span (head + descendants) — cluster zoom target. */
  start: number;
  end: number;
  childCluster?: PositionedCluster; // container-local row, offset after packing
}

function layoutBand(
  kind: TimelineKind,
  members: readonly VisibleItem[],
  scale: Scale,
  openEndYear: number,
  config: LayoutConfig,
): BandLayout {
  const band = config.bands[kind];

  // --- events: split into top-level units vs descendants of a visible parent
  const memberById = new Map(members.map((m) => [m.item.id, m]));
  const descendantsByTop = new Map<EntityId, VisibleItem[]>();
  const topLevel: VisibleItem[] = [];
  for (const m of members) {
    const top = topmostVisibleAncestor(m, memberById);
    if (top === m.item.id) {
      topLevel.push(m);
    } else {
      const list = descendantsByTop.get(top);
      if (list) list.push(m);
      else descendantsByTop.set(top, [m]);
    }
  }

  let units = topLevel.map((m) =>
    buildUnit(m, descendantsByTop.get(m.item.id) ?? [], scale, openEndYear, config, band),
  );

  // --- density cap (docs/05): keep the most important units for this width
  const capacity = Math.max(1, Math.ceil((band.maxItemsPer1000px * scale.widthPx) / 1000));
  const overflow: Unit[] = [];
  if (units.length > capacity) {
    const ranked = [...units].sort(unitByImportance);
    const keep = new Set(ranked.slice(0, capacity));
    overflow.push(...ranked.slice(capacity));
    units = units.filter((u) => keep.has(u));
  }

  // --- pack into rows (px first-fit; deterministic order)
  const rows: PxRect[][] = [];
  const placed: Unit[] = [];
  for (const unit of [...units].sort(unitByX)) {
    if (!placeUnit(unit, rows, band.maxRows, config.minGapPx)) {
      // A container that doesn't fit degrades to a plain bar before clustering.
      if (unit.heightRows > 1 && placeUnit(flattenUnit(unit), rows, band.maxRows, config.minGapPx)) {
        placed.push(unit);
      } else {
        overflow.push(unit);
      }
    } else {
      placed.push(unit);
    }
  }

  const items: PositionedItem[] = [];
  for (const unit of placed) {
    items.push(unit.positioned, ...unit.children);
  }

  let rowsUsed = Math.max(1, rows.length);
  const clusters: PositionedCluster[] = placed.flatMap((u) => (u.childCluster ? [u.childCluster] : []));

  // --- overflow → cluster chips on their own dedicated row
  if (overflow.length > 0) {
    const chipRow = rowsUsed;
    clusters.push(...buildClusters(overflow, chipRow, config));
    rowsUsed += 1;
  }

  items.sort((a, b) => a.item.start - b.item.start || a.item.id.localeCompare(b.item.id));
  return { kind, items, clusters, rows: rowsUsed };
}

/** Walk parentIds up through the visible set; returns the topmost visible id. */
function topmostVisibleAncestor(m: VisibleItem, byId: ReadonlyMap<EntityId, VisibleItem>): EntityId {
  let current = m;
  let hops = 0;
  while (current.item.parentId !== undefined && hops++ < 32) {
    const parent = byId.get(current.item.parentId);
    if (parent === undefined) break; // visibility guarantees this not to happen
    current = parent;
  }
  return current.item.id;
}

function estimateLabelPx(title: string, config: LayoutConfig): number {
  const { charPx, basePx, minPx, maxPx } = config.label;
  return Math.min(maxPx, Math.max(minPx, title.length * charPx + basePx));
}

/** Clamp a box to the viewport for label anchoring (falls back to the box). */
function labelAnchor(box: PxRect, widthPx: number): PxRect {
  const lo = Math.max(box.x, 0);
  const hi = Math.min(box.x + box.width, widthPx);
  if (hi <= lo) return box; // fully in the pan buffer — not visible anyway
  return { x: lo, width: hi - lo };
}

/** Box + label placement for one item (no children involved). */
function itemBox(
  m: VisibleItem,
  scale: Scale,
  openEndYear: number,
  config: LayoutConfig,
): Omit<PositionedItem, 'row' | 'heightRows' | 'isContainer'> {
  const { item, opacity } = m;
  const end = layoutEnd(item, openEndYear);
  const raw = rectOf(scale, item.start, end);
  const labelPx = estimateLabelPx(item.title, config);
  const openEnded = item.end === null;

  if (item.isPoint) {
    // Marker at the center of the date's precision range; label on the later side.
    const markerX = raw.x + raw.width / 2;
    const box = extendRectTowardLater(
      scale,
      { x: markerX - config.pointMarkerPx / 2, width: config.pointMarkerPx },
      config.pointMarkerPx + labelPx,
    );
    return {
      item, opacity,
      x: box.x, width: box.width,
      spanX: raw.x, spanWidth: raw.width,
      markerX,
      labelX: box.x, labelWidth: box.width,
      labelPlacement: 'aside',
      openEnded,
    };
  }

  const spanWidth = Math.max(raw.width, config.minSpanPx);
  const span: PxRect = extendRectTowardLater(scale, raw, spanWidth);
  if (item.kind === 'person') {
    // Name above a thin lifespan line; the box may exceed the span for the label.
    const box = extendRectTowardLater(scale, span, Math.max(spanWidth, labelPx));
    const anchor = labelAnchor(box, scale.widthPx);
    return {
      item, opacity,
      x: box.x, width: box.width,
      spanX: span.x, spanWidth,
      labelX: anchor.x, labelWidth: anchor.width,
      labelPlacement: 'above',
      openEnded,
    };
  }
  if (spanWidth < config.labelAsideBelowPx) {
    // Too narrow to read inside — label beside the bar, like a point item.
    const box = extendRectTowardLater(scale, span, spanWidth + labelPx);
    return {
      item, opacity,
      x: box.x, width: box.width,
      spanX: span.x, spanWidth,
      labelX: box.x, labelWidth: box.width,
      labelPlacement: 'aside',
      openEnded,
    };
  }
  const anchor = labelAnchor(span, scale.widthPx);
  return {
    item, opacity,
    x: span.x, width: span.width,
    spanX: span.x, spanWidth,
    labelX: anchor.x, labelWidth: anchor.width,
    labelPlacement: 'inside',
    openEnded,
  };
}

/** Build a packable unit; events with visible descendants become containers. */
function buildUnit(
  head: VisibleItem,
  descendants: readonly VisibleItem[],
  scale: Scale,
  openEndYear: number,
  config: LayoutConfig,
  band: BandConfig,
): Unit {
  const headBox = itemBox(head, scale, openEndYear, config);
  const ids = [head.item.id, ...descendants.map((d) => d.item.id)];
  let start = head.item.start;
  let end = layoutEnd(head.item, openEndYear);
  for (const d of descendants) {
    start = Math.min(start, d.item.start);
    end = Math.max(end, layoutEnd(d.item, openEndYear));
  }

  if (descendants.length === 0 || band.maxContainerChildRows === 0) {
    return {
      head,
      box: { x: headBox.x, width: headBox.width },
      heightRows: 1,
      positioned: { ...headBox, row: 0, heightRows: 1, isContainer: false },
      children: [],
      ids,
      start,
      end,
    };
  }

  // Pack children into container-local rows (bounded; overflow → child cluster).
  const childRows: PxRect[][] = [];
  const children: PositionedItem[] = [];
  const childOverflow: Unit[] = [];
  const childUnits = descendants.map((d) => {
    const box = itemBox(d, scale, openEndYear, config);
    return {
      head: d,
      box: { x: box.x, width: box.width },
      heightRows: 1,
      positioned: { ...box, row: 0, heightRows: 1, isContainer: false },
      children: [],
      ids: [d.item.id],
      start: d.item.start,
      end: layoutEnd(d.item, openEndYear),
    } satisfies Unit;
  });
  const reservedRows = band.maxContainerChildRows;
  for (const cu of [...childUnits].sort(unitByX)) {
    if (placeUnit(cu, childRows, reservedRows, config.minGapPx)) children.push(cu.positioned);
    else childOverflow.push(cu);
  }

  let childRowCount = Math.max(1, childRows.length);
  let childCluster: PositionedCluster | undefined;
  if (childOverflow.length > 0) {
    const merged = buildClusters(childOverflow, childRowCount, config);
    // Containers keep a single chip row; merge everything into one chip.
    childCluster = mergeClusters(merged);
    childRowCount += 1;
  }

  // Container box must cover the header and every child box.
  let minX = headBox.x;
  let maxX = headBox.x + headBox.width;
  for (const c of children) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x + c.width);
  }
  if (childCluster) {
    minX = Math.min(minX, childCluster.x);
    maxX = Math.max(maxX, childCluster.x + childCluster.width);
  }

  const heightRows = 1 + childRowCount;
  return {
    head,
    box: { x: minX, width: maxX - minX },
    heightRows,
    positioned: { ...headBox, x: minX, width: maxX - minX, row: 0, heightRows, isContainer: true },
    children,
    ids,
    start,
    end,
    ...(childCluster !== undefined ? { childCluster } : {}),
  };
}

/** Degrade a container in place: one plain row, children collapsed away. */
function flattenUnit(unit: Unit): Unit {
  const p = unit.positioned;
  unit.box = { x: p.spanX, width: p.spanWidth };
  unit.heightRows = 1;
  unit.positioned = { ...p, x: p.spanX, width: p.spanWidth, heightRows: 1, isContainer: false };
  unit.children = [];
  delete unit.childCluster;
  return unit;
}

/** Sort for packing: physical x, then earlier start, then id — deterministic. */
function unitByX(a: Unit, b: Unit): number {
  return a.box.x - b.box.x || a.start - b.start || a.head.item.id.localeCompare(b.head.item.id);
}

/** Sort for the density cap: importance desc, earlier start, id. */
function unitByImportance(a: Unit, b: Unit): number {
  return (
    b.head.item.importance - a.head.item.importance ||
    a.start - b.start ||
    a.head.item.id.localeCompare(b.head.item.id)
  );
}

/** First-fit: lowest row index where all heightRows rows are free over the box. */
function placeUnit(unit: Unit, rows: PxRect[][], maxRows: number, gapPx: number): boolean {
  for (let row = 0; row + unit.heightRows <= maxRows; row++) {
    if (fits(unit.box, rows, row, unit.heightRows, gapPx)) {
      for (let r = row; r < row + unit.heightRows; r++) {
        (rows[r] ??= []).push(unit.box);
      }
      unit.positioned.row += row;
      for (const child of unit.children) child.row += row + 1;
      if (unit.childCluster) unit.childCluster.row += row + 1;
      return true;
    }
  }
  return false;
}

function fits(box: PxRect, rows: PxRect[][], fromRow: number, heightRows: number, gapPx: number): boolean {
  for (let r = fromRow; r < fromRow + heightRows; r++) {
    for (const other of rows[r] ?? []) {
      if (box.x - gapPx < other.x + other.width && other.x - gapPx < box.x + box.width) return false;
    }
  }
  return true;
}

/**
 * Group overflow units into cluster chips: sort by x, join neighbors closer
 * than clusterJoinPx, then keep merging any chips whose rects still touch —
 * one row of chips can never overlap itself.
 */
function buildClusters(overflow: readonly Unit[], row: number, config: LayoutConfig): PositionedCluster[] {
  const sorted = [...overflow].sort(unitByX);
  const groups: Unit[][] = [];
  let current: Unit[] = [];
  let currentMaxX = -Infinity;
  for (const unit of sorted) {
    if (current.length > 0 && unit.box.x > currentMaxX + config.clusterJoinPx) {
      groups.push(current);
      current = [];
      currentMaxX = -Infinity;
    }
    current.push(unit);
    currentMaxX = Math.max(currentMaxX, unit.box.x + unit.box.width);
  }
  if (current.length > 0) groups.push(current);

  let chips = groups.map((group) => chipOf(group, row, config));
  // Chip rects (fixed width, centered) may still touch — merge until clean.
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i + 1 < chips.length; i++) {
      const a = chips[i]!;
      const b = chips[i + 1]!;
      if (b.x < a.x + a.width + config.minGapPx) {
        chips.splice(i, 2, mergeClusters([a, b]));
        merged = true;
        break;
      }
    }
  }
  return chips;
}

function chipOf(group: readonly Unit[], row: number, config: LayoutConfig): PositionedCluster {
  const ids = [...group]
    .sort(unitByImportance)
    .flatMap((u) => u.ids);
  let minX = Infinity;
  let maxX = -Infinity;
  let start = Infinity;
  let end = -Infinity;
  for (const u of group) {
    minX = Math.min(minX, u.box.x);
    maxX = Math.max(maxX, u.box.x + u.box.width);
    start = Math.min(start, u.start);
    end = Math.max(end, u.end);
  }
  const center = (minX + maxX) / 2;
  return { ids, x: center - config.clusterChipPx / 2, width: config.clusterChipPx, row, start, end };
}

function mergeClusters(chips: readonly PositionedCluster[]): PositionedCluster {
  const first = chips[0]!;
  let minX = Infinity;
  let maxX = -Infinity;
  let start = Infinity;
  let end = -Infinity;
  const ids: EntityId[] = [];
  for (const c of chips) {
    ids.push(...c.ids);
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x + c.width);
    start = Math.min(start, c.start);
    end = Math.max(end, c.end);
  }
  const width = first.width;
  const center = (minX + maxX) / 2;
  return { ids, x: center - width / 2, width, row: first.row, start, end };
}
