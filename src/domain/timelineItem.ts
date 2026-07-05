/**
 * TimelineItem — the single presentation format every timeline entity
 * normalizes into (docs/06-timeline-rendering.md). Downstream code
 * (filtering, semantic zoom, layout, rendering, detail panel) consumes ONLY
 * this shape; entity-specific data survives inside `detail`.
 */
import type { EntityId, Image, Link, Source } from './entities';
import type { HistDate } from './dates';

export type TimelineKind = 'event' | 'person' | 'work';

/**
 * The content-type filter dimension (docs/07-filtering.md):
 * 'event' | 'person' | a workType slug ('biography' | 'autobiography' |
 * 'historical-novel' | future types straight from the taxonomy).
 */
export type ContentType = string;

/** Everything the detail panel shows — entity-specific, precision-aware. */
export interface TimelineItemDetail {
  description: string;
  /** Precision-aware Hebrew display: "מאי 1948", "1936–1939", "≈1942", "1954–". */
  displayDate: string;
  image?: Image;
  links: Link[];
  /** Citations backing the facts (docs/04#sourcing) — shown under "מקורות". */
  sources: Source[];
  /** Works: formatted publication date ("יצא לאור…", decision D7 keeps it off the axis). */
  publicationDate?: string;
  publicationDateRaw?: HistDate;
  /** Works: resolved author display names (from people or authorName). */
  authorNames?: string[];
  /** Works: the people this work is about. */
  subjectPersonIds?: EntityId[];
  /** People: works about them (reverse index). */
  workIds?: EntityId[];
  /** Events: chronological child event ids. */
  childEventIds?: EntityId[];
}

export interface TimelineItem {
  id: EntityId;
  kind: TimelineKind;
  contentType: ContentType;
  /** Hebrew, already resolved from Text. */
  title: string;
  /** Decimal years (docs/03 date model). end null = open-ended. */
  start: number;
  end: number | null;
  /** Point marker vs span rendering. */
  isPoint: boolean;
  importance: number;
  regionIds: EntityId[];
  /** Person/event category ids (empty for works). */
  categoryIds: EntityId[];
  /** Event hierarchy (docs/06-timeline-rendering.md#event-hierarchy). */
  parentId?: EntityId;
  /** Design-token key driving item color/icon, resolved from taxonomies. */
  styleToken: string;
  detail: TimelineItemDetail;
}
