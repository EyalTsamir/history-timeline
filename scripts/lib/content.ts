/**
 * Content pipeline library (docs/spec/content.md#build-pipeline):
 * discovery + validation of authored JSON under content/, and assembly of the
 * compiled Dataset artifact. Pure functions over a content root so the two
 * CLIs and the tests share one code path; issues are aggregated, never thrown.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import {
  CategorySchema,
  EventSchema,
  PersonSchema,
  RegionSchema,
  RelationSchema,
  WorkSchema,
  WorkTypeDefSchema,
} from '../../src/domain/entities';
import type {
  Category,
  EntityId,
  EventEntity,
  PersonEntity,
  Region,
  Relation,
  WorkEntity,
  WorkTypeDef,
} from '../../src/domain/entities';
import { spanOf } from '../../src/domain/dates';
import type { DateRange } from '../../src/domain/dates';
import { DatasetSchema, SCHEMA_VERSION } from '../../src/domain/dataset';
import type { Dataset } from '../../src/domain/dataset';

export interface ContentIssue {
  /** Path relative to the content root, forward slashes (e.g. "events/1948-war.json"). */
  file: string;
  message: string;
  /** Location inside the file, when known (e.g. "dates.start", "[2].name.he"). */
  path?: string;
}

export interface ContentData {
  events: EventEntity[];
  people: PersonEntity[];
  works: WorkEntity[];
  personCategories: Category[];
  eventCategories: Category[];
  workTypes: WorkTypeDef[];
  regions: Region[];
  relations: Relation[];
}

export interface ContentCounts {
  events: number;
  people: number;
  works: number;
  personCategories: number;
  eventCategories: number;
  workTypes: number;
  regions: number;
  relations: number;
  /** Content JSON files discovered (entity files + taxonomy files + relations). */
  sourceFiles: number;
}

export interface CollectResult {
  /** null whenever errors exist — a dataset must never build from broken content. */
  data: ContentData | null;
  errors: ContentIssue[];
  warnings: ContentIssue[];
  /** Counts of successfully parsed entities, populated even when errors exist. */
  counts: ContentCounts;
}

export interface CollectOptions {
  /**
   * The known --cat-* design tokens (see extractStyleTokens). When provided,
   * every taxonomy `color` must be one of them — an unknown token would render
   * as an invisible `var(--cat-…)` with no build error. Omitted in unit tests
   * that exercise content rules in isolation.
   */
  styleTokens?: ReadonlySet<string>;
}

/**
 * `TimelineItem.contentType` uses 'event' and 'person' alongside workType
 * slugs (docs/spec/filtering.md); a work type with one of these ids would silently corrupt
 * the content-type filter dimension.
 */
const RESERVED_CONTENT_TYPE_IDS = new Set(['event', 'person']);

/** Parse the --cat-* token names out of a stylesheet (src/styles/tokens.css). */
export function extractStyleTokens(css: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of css.matchAll(/--cat-([a-z0-9-]+)\s*:/g)) tokens.add(match[1]!);
  return tokens;
}

const TAXONOMY_FILES = {
  personCategories: 'taxonomies/person-categories.json',
  eventCategories: 'taxonomies/event-categories.json',
  workTypes: 'taxonomies/work-types.json',
  regions: 'taxonomies/regions.json',
} as const;
const RELATIONS_FILE = 'relations.json';

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

/** Authoring comment convention: keys starting with "_" are stripped before parsing. */
function stripUnderscoreKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUnderscoreKeys);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (!key.startsWith('_')) out[key] = stripUnderscoreKeys(child);
    }
    return out;
  }
  return value;
}

function readJson(root: string, relPath: string, errors: ContentIssue[]): unknown {
  let raw: string;
  try {
    raw = readFileSync(join(root, relPath), 'utf8');
  } catch (e) {
    errors.push({ file: relPath, message: `cannot read file: ${(e as Error).message}` });
    return undefined;
  }
  try {
    return stripUnderscoreKeys(JSON.parse(raw));
  } catch (e) {
    errors.push({ file: relPath, message: `JSON syntax error: ${(e as Error).message}` });
    return undefined;
  }
}

function formatIssuePath(path: ReadonlyArray<string | number>): string | undefined {
  if (path.length === 0) return undefined;
  let out = '';
  for (const seg of path) {
    out += typeof seg === 'number' ? `[${seg}]` : out === '' ? String(seg) : `.${seg}`;
  }
  return out;
}

function pushZodIssues(file: string, error: z.ZodError, errors: ContentIssue[]): void {
  for (const issue of error.issues) {
    const path = formatIssuePath(issue.path);
    errors.push(path === undefined ? { file, message: issue.message } : { file, message: issue.message, path });
  }
}

interface SourceEntity<T> {
  entity: T;
  file: string;
}

/** One entity per file under <root>/<subdir>; "_"-prefixed files are ignored. */
function loadEntityDir<S extends z.ZodTypeAny>(
  root: string,
  subdir: string,
  schema: S,
  errors: ContentIssue[],
): { items: SourceEntity<z.output<S>>[]; fileCount: number } {
  const dir = join(root, subdir);
  if (!existsSync(dir)) return { items: [], fileCount: 0 };
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.json') && !d.name.startsWith('_'))
    .map((d) => d.name)
    .sort();
  const items: SourceEntity<z.output<S>>[] = [];
  for (const name of names) {
    const relPath = `${subdir}/${name}`;
    const json = readJson(root, relPath, errors);
    if (json === undefined) continue;
    const parsed = schema.safeParse(json);
    if (parsed.success) items.push({ entity: parsed.data, file: relPath });
    else pushZodIssues(relPath, parsed.error, errors);
  }
  return { items, fileCount: names.length };
}

/** A whole-array file (taxonomies, relations); absent file → empty list. */
function loadListFile<S extends z.ZodTypeAny>(
  root: string,
  relPath: string,
  schema: S,
  errors: ContentIssue[],
): { items: z.output<S>[]; present: boolean } {
  if (!existsSync(join(root, relPath))) return { items: [], present: false };
  const json = readJson(root, relPath, errors);
  if (json === undefined) return { items: [], present: true };
  const parsed = z.array(schema).safeParse(json);
  if (!parsed.success) {
    pushZodIssues(relPath, parsed.error, errors);
    return { items: [], present: true };
  }
  return { items: parsed.data, present: true };
}

// ---------------------------------------------------------------------------
// Cross-file validation
// ---------------------------------------------------------------------------

/** Each cycle is reported once, as [a, b, …, a]; a self-reference is [a, a]. */
function findParentCycles(
  nodes: ReadonlyArray<{ id: EntityId; parentId?: EntityId | undefined }>,
): EntityId[][] {
  const parentOf = new Map<EntityId, EntityId>();
  for (const n of nodes) if (n.parentId !== undefined) parentOf.set(n.id, n.parentId);
  const state = new Map<EntityId, 'visiting' | 'done'>();
  const cycles: EntityId[][] = [];
  for (const n of nodes) {
    if (state.has(n.id)) continue;
    const chain: EntityId[] = [];
    let cur: EntityId | undefined = n.id;
    while (cur !== undefined && !state.has(cur)) {
      state.set(cur, 'visiting');
      chain.push(cur);
      cur = parentOf.get(cur);
    }
    if (cur !== undefined && state.get(cur) === 'visiting') {
      cycles.push([...chain.slice(chain.indexOf(cur)), cur]);
    }
    for (const id of chain) state.set(id, 'done');
  }
  return cycles;
}

/**
 * Discover and validate all content under `root`. Aggregates every issue
 * (never fail-fast); `data` is non-null only when there are zero errors.
 */
export function collectContent(root: string = 'content', options: CollectOptions = {}): CollectResult {
  const errors: ContentIssue[] = [];
  const warnings: ContentIssue[] = [];

  const eventsSrc = loadEntityDir(root, 'events', EventSchema, errors);
  const peopleSrc = loadEntityDir(root, 'people', PersonSchema, errors);
  const worksSrc = loadEntityDir(root, 'works', WorkSchema, errors);
  const personCategories = loadListFile(root, TAXONOMY_FILES.personCategories, CategorySchema, errors);
  const eventCategories = loadListFile(root, TAXONOMY_FILES.eventCategories, CategorySchema, errors);
  const workTypes = loadListFile(root, TAXONOMY_FILES.workTypes, WorkTypeDefSchema, errors);
  const regions = loadListFile(root, TAXONOMY_FILES.regions, RegionSchema, errors);
  const relations = loadListFile(root, RELATIONS_FILE, RelationSchema, errors);

  const events = eventsSrc.items.map((s) => s.entity);
  const people = peopleSrc.items.map((s) => s.entity);
  const works = worksSrc.items.map((s) => s.entity);

  // (a) id uniqueness — one global namespace across entities AND taxonomies.
  const fileById = new Map<EntityId, string>();
  const registerId = (id: EntityId, file: string): void => {
    const existing = fileById.get(id);
    if (existing === undefined) fileById.set(id, file);
    else errors.push({ file, message: `duplicate id "${id}" (already defined in ${existing})` });
  };
  for (const { entity, file } of [...eventsSrc.items, ...peopleSrc.items, ...worksSrc.items]) {
    registerId(entity.id, file);
    // (d) filename convention — the id inside the file is authoritative.
    if (basename(file, '.json') !== entity.id) {
      warnings.push({ file, message: `file name "${basename(file)}" does not match entity id "${entity.id}"` });
    }
  }
  for (const c of personCategories.items) registerId(c.id, TAXONOMY_FILES.personCategories);
  for (const c of eventCategories.items) registerId(c.id, TAXONOMY_FILES.eventCategories);
  for (const t of workTypes.items) {
    registerId(t.id, TAXONOMY_FILES.workTypes);
    if (RESERVED_CONTENT_TYPE_IDS.has(t.id)) {
      errors.push({
        file: TAXONOMY_FILES.workTypes,
        message: `work type id "${t.id}" is reserved — it collides with the built-in content-type values (docs/spec/filtering.md)`,
      });
    }
  }
  for (const r of regions.items) registerId(r.id, TAXONOMY_FILES.regions);

  // Taxonomy colors must resolve to real --cat-* design tokens when the token
  // set is supplied (CLIs always supply it; see extractStyleTokens).
  if (options.styleTokens !== undefined) {
    const tokens = options.styleTokens;
    const checkColor = (file: string, id: EntityId, color: string): void => {
      if (!tokens.has(color)) {
        errors.push({
          file,
          message: `color "${color}" of "${id}" has no --cat-${color} token in src/styles/tokens.css — it would render invisible`,
        });
      }
    };
    for (const c of personCategories.items) checkColor(TAXONOMY_FILES.personCategories, c.id, c.color);
    for (const c of eventCategories.items) checkColor(TAXONOMY_FILES.eventCategories, c.id, c.color);
    for (const t of workTypes.items) checkColor(TAXONOMY_FILES.workTypes, t.id, t.color);
  }

  // (b) referential integrity — no dangling id may reach the app.
  const eventIds = new Set(events.map((e) => e.id));
  const personIds = new Set(people.map((p) => p.id));
  const personCategoryIds = new Set(personCategories.items.map((c) => c.id));
  const eventCategoryIds = new Set(eventCategories.items.map((c) => c.id));
  const workTypeIds = new Set(workTypes.items.map((t) => t.id));
  const regionIdSet = new Set(regions.items.map((r) => r.id));
  const timelineEntityIds = new Set<EntityId>([...eventIds, ...personIds, ...works.map((w) => w.id)]);

  const requireRef = (file: string, path: string, id: EntityId, known: ReadonlySet<string>, kind: string): void => {
    if (!known.has(id)) errors.push({ file, message: `${path} references unknown ${kind} "${id}"`, path });
  };

  for (const { entity: e, file } of eventsSrc.items) {
    if (e.parentId !== undefined) requireRef(file, 'parentId', e.parentId, eventIds, 'event');
    e.categoryIds.forEach((id, i) => requireRef(file, `categoryIds[${i}]`, id, eventCategoryIds, 'event category'));
    e.regionIds.forEach((id, i) => requireRef(file, `regionIds[${i}]`, id, regionIdSet, 'region'));
  }
  for (const { entity: p, file } of peopleSrc.items) {
    p.categoryIds.forEach((id, i) => requireRef(file, `categoryIds[${i}]`, id, personCategoryIds, 'person category'));
    p.regionIds.forEach((id, i) => requireRef(file, `regionIds[${i}]`, id, regionIdSet, 'region'));
  }
  for (const { entity: w, file } of worksSrc.items) {
    requireRef(file, 'workType', w.workType, workTypeIds, 'work type');
    w.authorPersonIds.forEach((id, i) => requireRef(file, `authorPersonIds[${i}]`, id, personIds, 'person'));
    w.subjectPersonIds.forEach((id, i) => requireRef(file, `subjectPersonIds[${i}]`, id, personIds, 'person'));
    w.subjectEventIds.forEach((id, i) => requireRef(file, `subjectEventIds[${i}]`, id, eventIds, 'event'));
    w.regionIds.forEach((id, i) => requireRef(file, `regionIds[${i}]`, id, regionIdSet, 'region'));
  }
  for (const r of regions.items) {
    if (r.parentId !== undefined) {
      requireRef(TAXONOMY_FILES.regions, `parentId of "${r.id}"`, r.parentId, regionIdSet, 'region');
    }
  }
  relations.items.forEach((rel, i) => {
    requireRef(RELATIONS_FILE, `[${i}].from`, rel.from, timelineEntityIds, 'entity');
    requireRef(RELATIONS_FILE, `[${i}].to`, rel.to, timelineEntityIds, 'entity');
  });

  // (c) parentId cycles, including self-reference.
  for (const cycle of findParentCycles(events)) {
    const head = cycle[0]!;
    errors.push({
      file: fileById.get(head) ?? 'events',
      message: `event parentId cycle detected: ${cycle.join(' -> ')}`,
    });
  }
  for (const cycle of findParentCycles(regions.items)) {
    errors.push({
      file: TAXONOMY_FILES.regions,
      message: `region parentId cycle detected: ${cycle.join(' -> ')}`,
    });
  }

  // (d) importance rubric: sub-events should score lower than their parent (docs/spec/zoom.md).
  const eventById = new Map(events.map((e) => [e.id, e] as const));
  for (const { entity: e, file } of eventsSrc.items) {
    if (e.parentId === undefined) continue;
    const parent = eventById.get(e.parentId);
    if (parent !== undefined && e.importance >= parent.importance) {
      warnings.push({
        file,
        message:
          `sub-event importance (${e.importance}) >= parent event "${parent.id}" importance ` +
          `(${parent.importance}) — sub-events should score lower (docs/spec/zoom.md rubric)`,
      });
    }
  }

  // (e) sourcing (docs/spec/content.md#sourcing): every timeline entity must cite ≥1 source.
  for (const { entity, file } of [...eventsSrc.items, ...peopleSrc.items, ...worksSrc.items]) {
    if (entity.sources.length === 0) {
      errors.push({
        file,
        message: 'no sources — every entity must cite at least one source (docs/spec/content.md#sourcing)',
        path: 'sources',
      });
    }
  }

  // (f) date sanity: a concrete date in the future is almost always a typo
  //     (e.g. 2091 for 1991). Living people carry end:null, not a future date.
  const buildYear = new Date().getFullYear();
  const checkNotFuture = (file: string, path: string, hist: string): void => {
    if (Number(hist.slice(0, 4)) > buildYear) {
      errors.push({ file, message: `date "${hist}" is in the future (after ${buildYear}) — likely a typo`, path });
    }
  };
  for (const { entity: e, file } of eventsSrc.items) {
    checkNotFuture(file, 'dates.start', e.dates.start);
    if (typeof e.dates.end === 'string') checkNotFuture(file, 'dates.end', e.dates.end);
  }
  for (const { entity: p, file } of peopleSrc.items) {
    checkNotFuture(file, 'lifespan.start', p.lifespan.start);
    if (typeof p.lifespan.end === 'string') checkNotFuture(file, 'lifespan.end', p.lifespan.end);
  }
  for (const { entity: w, file } of worksSrc.items) {
    checkNotFuture(file, 'coveredPeriod.start', w.coveredPeriod.start);
    if (typeof w.coveredPeriod.end === 'string') checkNotFuture(file, 'coveredPeriod.end', w.coveredPeriod.end);
    checkNotFuture(file, 'publicationDate', w.publicationDate);
  }

  // (g) impossible lifespan (WARNING): a closed span beyond ~120 years is
  //     almost certainly a bad date, not a supercentenarian.
  const MAX_LIFESPAN_YEARS = 120;
  for (const { entity: p, file } of peopleSrc.items) {
    const span = spanOf(p.lifespan);
    if (span.end !== null && span.end - span.start > MAX_LIFESPAN_YEARS) {
      warnings.push({
        file,
        message: `lifespan spans ~${Math.round(span.end - span.start)} years (> ${MAX_LIFESPAN_YEARS}) — check the dates`,
        path: 'lifespan',
      });
    }
  }

  // (h) sub-event temporal containment (WARNING): a sub-event whose period does
  //     not overlap its parent's at all is almost certainly misdated (docs/spec/rendering.md).
  for (const { entity: e, file } of eventsSrc.items) {
    if (e.parentId === undefined) continue;
    const parent = eventById.get(e.parentId);
    if (parent === undefined) continue; // dangling parentId already errored in (b)
    const child = spanOf(e.dates);
    const par = spanOf(parent.dates);
    const childEnd = child.end ?? Infinity;
    const parEnd = par.end ?? Infinity;
    const overlaps = child.start < parEnd && par.start < childEnd;
    if (!overlaps) {
      warnings.push({
        file,
        message: `sub-event period does not overlap parent event "${parent.id}" period — check the dates (docs/spec/rendering.md)`,
        path: 'dates',
      });
    }
  }

  // (i) relations hygiene: reject self-loops; warn on duplicate edges.
  const seenEdges = new Set<string>();
  relations.items.forEach((rel, i) => {
    if (rel.from === rel.to) {
      errors.push({ file: RELATIONS_FILE, message: `[${i}] relation links "${rel.from}" to itself`, path: `[${i}]` });
    }
    const key = `${rel.from} ${rel.to} ${rel.type}`;
    if (seenEdges.has(key)) {
      warnings.push({
        file: RELATIONS_FILE,
        message: `[${i}] duplicate relation: ${rel.from} —${rel.type}→ ${rel.to}`,
        path: `[${i}]`,
      });
    } else {
      seenEdges.add(key);
    }
  });

  // (j) duplicate ids within a single reference list (WARNING) — a copy-paste slip.
  const checkDupRefs = (file: string, path: string, ids: readonly EntityId[]): void => {
    const seen = new Set<EntityId>();
    for (const id of ids) {
      if (seen.has(id)) warnings.push({ file, message: `duplicate entry "${id}" in ${path}`, path });
      else seen.add(id);
    }
  };
  for (const { entity: e, file } of eventsSrc.items) {
    checkDupRefs(file, 'categoryIds', e.categoryIds);
    checkDupRefs(file, 'regionIds', e.regionIds);
  }
  for (const { entity: p, file } of peopleSrc.items) {
    checkDupRefs(file, 'categoryIds', p.categoryIds);
    checkDupRefs(file, 'regionIds', p.regionIds);
  }
  for (const { entity: w, file } of worksSrc.items) {
    checkDupRefs(file, 'authorPersonIds', w.authorPersonIds);
    checkDupRefs(file, 'subjectPersonIds', w.subjectPersonIds);
    checkDupRefs(file, 'subjectEventIds', w.subjectEventIds);
    checkDupRefs(file, 'regionIds', w.regionIds);
  }

  // (k) projectability: every entity must yield a finite timeline span — the app
  //     can't place an item it can't project. Holds by construction today (dates
  //     are validated), so this only fires if a future schema change breaks it.
  const assertProjectable = (file: string, range: DateRange): void => {
    try {
      const s = spanOf(range);
      if (!Number.isFinite(s.start) || (s.end !== null && !Number.isFinite(s.end))) {
        errors.push({ file, message: 'entity does not project to a finite timeline span' });
      }
    } catch (err) {
      errors.push({ file, message: `entity cannot be projected onto the timeline: ${(err as Error).message}` });
    }
  };
  for (const { entity: e, file } of eventsSrc.items) assertProjectable(file, e.dates);
  for (const { entity: p, file } of peopleSrc.items) assertProjectable(file, p.lifespan);
  for (const { entity: w, file } of worksSrc.items) assertProjectable(file, w.coveredPeriod);

  const counts: ContentCounts = {
    events: events.length,
    people: people.length,
    works: works.length,
    personCategories: personCategories.items.length,
    eventCategories: eventCategories.items.length,
    workTypes: workTypes.items.length,
    regions: regions.items.length,
    relations: relations.items.length,
    sourceFiles:
      eventsSrc.fileCount +
      peopleSrc.fileCount +
      worksSrc.fileCount +
      [personCategories, eventCategories, workTypes, regions, relations].filter((f) => f.present).length,
  };

  const data: ContentData | null =
    errors.length > 0
      ? null
      : {
          events,
          people,
          works,
          personCategories: personCategories.items,
          eventCategories: eventCategories.items,
          workTypes: workTypes.items,
          regions: regions.items,
          relations: relations.items,
        };

  return { data, errors, warnings, counts };
}

// ---------------------------------------------------------------------------
// Dataset assembly
// ---------------------------------------------------------------------------

/** Sort by timeline start asc; ties: higher importance first, then id (docs/spec/performance.md). */
function sortTimeline<T extends { id: EntityId; importance: number }>(
  items: readonly T[],
  startOf: (item: T) => number,
): T[] {
  return items
    .map((item) => ({ item, start: startOf(item) }))
    .sort(
      (a, b) =>
        a.start - b.start || b.item.importance - a.item.importance || a.item.id.localeCompare(b.item.id),
    )
    .map((entry) => entry.item);
}

/** region id → [self, …all transitive descendants], pre-order in declaration order. */
function computeRegionDescendants(regions: readonly Region[]): Record<string, EntityId[]> {
  const childrenOf = new Map<EntityId, EntityId[]>();
  for (const r of regions) {
    if (r.parentId === undefined) continue;
    const list = childrenOf.get(r.parentId) ?? [];
    list.push(r.id);
    childrenOf.set(r.parentId, list);
  }
  const out: Record<string, EntityId[]> = {};
  const collect = (id: EntityId, acc: EntityId[], seen: Set<EntityId>): void => {
    if (seen.has(id)) return; // defensive against cycles when called outside build flow
    seen.add(id);
    acc.push(id);
    for (const child of childrenOf.get(id) ?? []) collect(child, acc, seen);
  };
  for (const r of regions) {
    const acc: EntityId[] = [];
    collect(r.id, acc, new Set());
    out[r.id] = acc;
  }
  return out;
}

/**
 * Compile validated content into the Dataset artifact. The result is parsed
 * through DatasetSchema, so the emitted artifact is valid by construction.
 * Call only with the `data` of an error-free collectContent result.
 */
export function buildDataset(data: ContentData, generatedAt: string = new Date().toISOString()): Dataset {
  const events = sortTimeline(data.events, (e) => spanOf(e.dates).start);
  const people = sortTimeline(data.people, (p) => spanOf(p.lifespan).start);
  const works = sortTimeline(data.works, (w) => spanOf(w.coveredPeriod).start);

  const childrenByEvent: Record<string, EntityId[]> = {};
  for (const e of events) {
    if (e.parentId !== undefined) (childrenByEvent[e.parentId] ??= []).push(e.id);
  }
  const worksByPerson: Record<string, EntityId[]> = {};
  const worksByAuthor: Record<string, EntityId[]> = {};
  for (const w of works) {
    for (const pid of w.subjectPersonIds) (worksByPerson[pid] ??= []).push(w.id);
    for (const pid of w.authorPersonIds) (worksByAuthor[pid] ??= []).push(w.id);
  }

  return DatasetSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    events,
    people,
    works,
    personCategories: data.personCategories,
    eventCategories: data.eventCategories,
    workTypes: data.workTypes,
    regions: data.regions,
    relations: data.relations,
    indexes: {
      childrenByEvent,
      worksByPerson,
      worksByAuthor,
      regionDescendants: computeRegionDescendants(data.regions),
    },
  });
}

// ---------------------------------------------------------------------------
// CLI reporting
// ---------------------------------------------------------------------------

/** Lines grouped by file, errors before warnings within each file. */
export function renderIssueReport(errors: readonly ContentIssue[], warnings: readonly ContentIssue[]): string[] {
  const files = [...new Set([...errors, ...warnings].map((i) => i.file))].sort();
  const lines: string[] = [];
  const format = (severity: string, issue: ContentIssue): string => {
    const prefix = issue.path !== undefined && !issue.message.startsWith(issue.path) ? `${issue.path}: ` : '';
    return `  ${severity}  ${prefix}${issue.message}`;
  };
  for (const file of files) {
    lines.push(file);
    for (const issue of errors) if (issue.file === file) lines.push(format('error  ', issue));
    for (const issue of warnings) if (issue.file === file) lines.push(format('warning', issue));
  }
  return lines;
}
