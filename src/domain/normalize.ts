/**
 * Normalization: domain entities → TimelineItem, the single presentation
 * format (docs/06-timeline-rendering.md). Pure functions, no React/DOM.
 *
 * Key rule (decision D7): a work's timeline span derives from coveredPeriod,
 * NOT publicationDate — publication data survives in `detail`.
 */
import type { Dataset } from './dataset';
import type { EntityId, EventEntity, PersonEntity, WorkEntity } from './entities';
import { formatDateRange, formatHistDate, rangeKind, spanOf } from './dates';
import type { TimelineItem, TimelineItemDetail } from './timelineItem';

export interface NormalizeContext {
  /** category id → design token (person + event categories merged; ids are globally unique). */
  colorByCategoryId: ReadonlyMap<EntityId, string>;
  colorByWorkTypeId: ReadonlyMap<EntityId, string>;
  nameByPersonId: ReadonlyMap<EntityId, string>;
  indexes: Dataset['indexes'];
}

export const DEFAULT_STYLE_TOKENS = {
  event: 'event',
  person: 'person',
  work: 'work',
} as const;

export function buildNormalizeContext(dataset: Dataset): NormalizeContext {
  const colorByCategoryId = new Map<EntityId, string>();
  for (const c of dataset.personCategories) colorByCategoryId.set(c.id, c.color);
  for (const c of dataset.eventCategories) colorByCategoryId.set(c.id, c.color);
  const colorByWorkTypeId = new Map<EntityId, string>();
  for (const wt of dataset.workTypes) colorByWorkTypeId.set(wt.id, wt.color);
  const nameByPersonId = new Map<EntityId, string>();
  for (const p of dataset.people) nameByPersonId.set(p.id, p.name.he);
  return { colorByCategoryId, colorByWorkTypeId, nameByPersonId, indexes: dataset.indexes };
}

function styleTokenFor(categoryIds: EntityId[], colors: ReadonlyMap<EntityId, string>, fallback: string): string {
  const first = categoryIds[0];
  return (first !== undefined ? colors.get(first) : undefined) ?? fallback;
}

export function eventToTimelineItem(event: EventEntity, ctx: NormalizeContext): TimelineItem {
  const span = spanOf(event.dates);
  const detail: TimelineItemDetail = {
    description: event.description.he,
    displayDate: formatDateRange(event.dates),
    links: event.links,
    sources: event.sources,
  };
  if (event.image) detail.image = event.image;
  const children = ctx.indexes.childrenByEvent[event.id];
  if (children && children.length > 0) detail.childEventIds = children;

  const item: TimelineItem = {
    id: event.id,
    kind: 'event',
    contentType: 'event',
    title: event.title.he,
    start: span.start,
    end: span.end,
    isPoint: rangeKind(event.dates) === 'point',
    importance: event.importance,
    regionIds: event.regionIds,
    categoryIds: event.categoryIds,
    styleToken: styleTokenFor(event.categoryIds, ctx.colorByCategoryId, DEFAULT_STYLE_TOKENS.event),
    detail,
  };
  if (event.parentId !== undefined) item.parentId = event.parentId;
  return item;
}

export function personToTimelineItem(person: PersonEntity, ctx: NormalizeContext): TimelineItem {
  const span = spanOf(person.lifespan);
  const detail: TimelineItemDetail = {
    description: person.bio.he,
    displayDate: formatDateRange(person.lifespan),
    links: person.links,
    sources: person.sources,
  };
  if (person.image) detail.image = person.image;
  const works = ctx.indexes.worksByPerson[person.id];
  if (works && works.length > 0) detail.workIds = works;

  return {
    id: person.id,
    kind: 'person',
    contentType: 'person',
    title: person.name.he,
    start: span.start,
    end: span.end, // null while alive → open-ended lifespan rendering
    isPoint: false, // a lifespan is always a span, whatever its precision
    importance: person.importance,
    regionIds: person.regionIds,
    categoryIds: person.categoryIds,
    styleToken: styleTokenFor(person.categoryIds, ctx.colorByCategoryId, DEFAULT_STYLE_TOKENS.person),
    detail,
  };
}

export function workToTimelineItem(work: WorkEntity, ctx: NormalizeContext): TimelineItem {
  // D7: position by the period the work DESCRIBES, not when it was published.
  const span = spanOf(work.coveredPeriod);

  const authorNames = work.authorPersonIds
    .map((id) => ctx.nameByPersonId.get(id))
    .filter((n): n is string => n !== undefined);
  if (work.authorName) authorNames.push(work.authorName.he);

  const detail: TimelineItemDetail = {
    description: work.description.he,
    displayDate: formatDateRange(work.coveredPeriod),
    links: work.links,
    sources: work.sources,
    publicationDate: formatHistDate(work.publicationDate),
    publicationDateRaw: work.publicationDate,
    authorNames,
  };
  if (work.image) detail.image = work.image;
  if (work.subjectPersonIds.length > 0) detail.subjectPersonIds = work.subjectPersonIds;

  return {
    id: work.id,
    kind: 'work',
    contentType: work.workType, // filter dimension value (docs/07)
    title: work.title.he,
    start: span.start,
    end: span.end,
    isPoint: rangeKind(work.coveredPeriod) === 'point',
    importance: work.importance,
    regionIds: work.regionIds,
    categoryIds: [],
    styleToken: ctx.colorByWorkTypeId.get(work.workType) ?? DEFAULT_STYLE_TOKENS.work,
    detail,
  };
}

/** Normalize the whole dataset, sorted by (start, importance desc, id) — the
 *  order the timeline pipeline relies on (docs/10-performance.md). */
export function normalizeDataset(dataset: Dataset): TimelineItem[] {
  const ctx = buildNormalizeContext(dataset);
  const items: TimelineItem[] = [
    ...dataset.events.map((e) => eventToTimelineItem(e, ctx)),
    ...dataset.people.map((p) => personToTimelineItem(p, ctx)),
    ...dataset.works.map((w) => workToTimelineItem(w, ctx)),
  ];
  items.sort((a, b) => a.start - b.start || b.importance - a.importance || a.id.localeCompare(b.id));
  return items;
}
