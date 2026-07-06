/**
 * Entity schemas — the single source of truth for the domain model
 * (docs/spec/domain.md). Zod schemas validate content at build time
 * AND derive the TypeScript types used across the app. Change shapes here,
 * bump SCHEMA_VERSION in dataset.ts when the change is breaking.
 */
import { z } from 'zod';
import { isValidHistDate, isValidRangeOrder } from './dates';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Kebab-case slug, unique across ALL entity types (e.g. "war-of-independence"). */
export const EntityIdSchema = z
  .string()
  .regex(SLUG_RE, 'id must be a kebab-case ascii slug, e.g. "war-of-independence"');
export type EntityId = z.infer<typeof EntityIdSchema>;

/** Language-keyed text. Adding `en` later is additive (decision D1). */
export const TextSchema = z.object({ he: z.string().trim().min(1, 'Hebrew text is required') }).strict();
export type Text = z.infer<typeof TextSchema>;

export const HistDateSchema = z
  .string()
  .refine(isValidHistDate, (v) => ({
    message: `"${v}" is not a valid date — use "YYYY", "YYYY-MM" or "YYYY-MM-DD" with a real calendar date`,
  }));

export const DateRangeSchema = z
  .object({
    start: HistDateSchema,
    end: HistDateSchema.nullable().optional(),
    approx: z.boolean().optional(),
  })
  .strict()
  .refine((r) => isValidRangeOrder(r), { message: 'range end precedes its start' });

/**
 * A person's lifespan: `end` is REQUIRED — a death date, or null while alive.
 * A point-in-time lifespan is meaningless, and an omitted `end` is the most
 * likely authoring mistake for living people; the generic DateRangeSchema
 * would silently accept it as a fabricated 1-year life.
 */
export const LifespanSchema = z
  .object({
    start: HistDateSchema,
    end: HistDateSchema.nullable(),
    approx: z.boolean().optional(),
  })
  .strict()
  .refine((r) => isValidRangeOrder(r), { message: 'range end precedes its start' });

export const ImageSchema = z
  .object({
    src: z.string().min(1),
    alt: TextSchema,
    credit: z.string().optional(),
  })
  .strict();
export type Image = z.infer<typeof ImageSchema>;

export const VIDEO_PROVIDERS = ['youtube'] as const;

/**
 * A closed `provider` + a validated bare id (never a raw URL or embed HTML) so
 * the render path fully controls the resulting iframe src
 * (`https://www.youtube-nocookie.com/embed/<videoId>`) — a content file can
 * never smuggle in an arbitrary domain or markup (decision D19).
 */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export const VideoSchema = z
  .object({
    provider: z.enum(VIDEO_PROVIDERS),
    videoId: z.string().regex(YOUTUBE_ID_RE, 'videoId must be an 11-character YouTube video id'),
    title: TextSchema,
    credit: z.string().optional(),
  })
  .strict();
export type Video = z.infer<typeof VideoSchema>;

/**
 * A citable http(s) URL that isn't an authoring placeholder. `z.string().url()`
 * alone accepts the templates' `https://…/wiki/...` and `example.com` stand-ins;
 * those must never reach the app as if they were real sources (docs/spec/content.md sourcing
 * policy). Reachability is deliberately NOT checked — that needs the network and
 * would make validation flaky; broken links are a content-review concern.
 */
export const CitationUrlSchema = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: 'url must use http(s)' })
  .refine((u) => !/\.\.\.|example\.(com|org|net)|your-|placeholder|xxxx|<|>/i.test(u), {
    message: 'url looks like a placeholder — cite a real source URL, or omit the url',
  });

/**
 * A citation backing an entity's facts (docs/spec/content.md#sourcing). A source
 * both answers "how do we know this?" and gives the reader somewhere to go — so a
 * `url` is REQUIRED (a source with no reachable page doesn't help; decision D18).
 * Prefer naming an authoritative institution (national library, archive, university,
 * museum, established encyclopedia). The validator requires every timeline entity to
 * carry at least one source.
 */
export const SOURCE_KINDS = [
  'archive',
  'library',
  'museum',
  'encyclopedia',
  'reference',
  'academic',
  'government',
  'book',
  'press',
  'website',
] as const;

export const SourceSchema = z
  .object({
    /** Display text — the source's name/title (Hebrew, but may hold a Latin name). */
    title: TextSchema,
    /** Institution or publisher behind the source, when distinct from the title. */
    publisher: z.string().trim().min(1).optional(),
    /** Real, stable URL backing the citation — required (decision D18). */
    url: CitationUrlSchema,
    kind: z.enum(SOURCE_KINDS).optional(),
  })
  .strict();
export type Source = z.infer<typeof SourceSchema>;

/** 1–100; authored per the rubric in docs/spec/zoom.md#importance-rubric. */
export const ImportanceSchema = z.number().int().min(1).max(100);

/** Open extension point so future needs don't force a schema bump. */
const MetaSchema = z.record(z.unknown()).optional();

// ---------------------------------------------------------------------------
// Timeline entities
// ---------------------------------------------------------------------------

export const EventSchema = z
  .object({
    id: EntityIdSchema,
    type: z.literal('event'),
    title: TextSchema,
    description: TextSchema,
    dates: DateRangeSchema,
    /** Sub-event → parent event. Arbitrary depth allowed; validator rejects cycles. */
    parentId: EntityIdSchema.optional(),
    importance: ImportanceSchema,
    categoryIds: z.array(EntityIdSchema).default([]),
    tags: z.array(z.string()).optional(),
    image: ImageSchema.optional(),
    /** Rare — only when real, good-quality archival footage exists (decision D19). */
    video: VideoSchema.optional(),
    /** Citations backing the facts; validator requires ≥1 (docs/spec/content.md#sourcing). */
    sources: z.array(SourceSchema).default([]),
    meta: MetaSchema,
  })
  .strict();
export type EventEntity = z.infer<typeof EventSchema>;

export const PersonSchema = z
  .object({
    id: EntityIdSchema,
    type: z.literal('person'),
    name: TextSchema,
    bio: TextSchema,
    /** end: null while alive — renders as an open-ended lifespan. */
    lifespan: LifespanSchema,
    categoryIds: z.array(EntityIdSchema).min(1, 'a person needs at least one category'),
    importance: ImportanceSchema,
    image: ImageSchema.optional(),
    /** Citations backing the facts; validator requires ≥1 (docs/spec/content.md#sourcing). */
    sources: z.array(SourceSchema).default([]),
    meta: MetaSchema,
  })
  .strict();
export type PersonEntity = z.infer<typeof PersonSchema>;

export const WorkSchema = z
  .object({
    id: EntityIdSchema,
    type: z.literal('work'),
    /**
     * Slug validated against the work-types taxonomy at build time — adding a
     * work type is a content change, not a code change (docs/spec/domain.md, taxonomies).
     */
    workType: EntityIdSchema,
    title: TextSchema,
    description: TextSchema,
    /** Authors who are themselves timeline people… */
    authorPersonIds: z.array(EntityIdSchema).default([]),
    /** …or a plain display name when they aren't. */
    authorName: TextSchema.optional(),
    subjectPersonIds: z.array(EntityIdSchema).default([]),
    subjectEventIds: z.array(EntityIdSchema).default([]),
    /** Stored for future views; NOT the timeline position (decision D7). */
    publicationDate: HistDateSchema,
    /** ← the timeline position derives from this. */
    coveredPeriod: DateRangeSchema,
    importance: ImportanceSchema,
    image: ImageSchema.optional(),
    /** Citations backing the facts; validator requires ≥1 (docs/spec/content.md#sourcing). */
    sources: z.array(SourceSchema).default([]),
    meta: MetaSchema,
  })
  .strict()
  .refine((w) => w.authorPersonIds.length > 0 || w.authorName !== undefined, {
    message: 'a work needs authorPersonIds and/or authorName',
    path: ['authorName'],
  });
export type WorkEntity = z.infer<typeof WorkSchema>;

// ---------------------------------------------------------------------------
// Taxonomies — one consistent shape (docs/spec/domain.md#extensibility-notes)
// ---------------------------------------------------------------------------

/** Person categories AND event categories share this shape. */
export const CategorySchema = z
  .object({
    id: EntityIdSchema,
    name: TextSchema,
    /** Design-token key (see src/styles/tokens.css), not a raw CSS color. */
    color: z.string().regex(SLUG_RE),
    description: TextSchema.optional(),
  })
  .strict();
export type Category = z.infer<typeof CategorySchema>;

/** biography | autobiography | historical-novel today; extensible by content. */
export const WorkTypeDefSchema = z
  .object({
    id: EntityIdSchema,
    name: TextSchema,
    color: z.string().regex(SLUG_RE),
    description: TextSchema.optional(),
  })
  .strict();
export type WorkTypeDef = z.infer<typeof WorkTypeDefSchema>;

// ---------------------------------------------------------------------------
// Generic relations — stored + validated now, explorer UI is future (docs/spec/domain.md)
// ---------------------------------------------------------------------------

export const RELATION_TYPES = ['participated-in', 'led', 'influenced', 'related-to'] as const;

export const RelationSchema = z
  .object({
    from: EntityIdSchema,
    to: EntityIdSchema,
    type: z.enum(RELATION_TYPES),
    note: TextSchema.optional(),
  })
  .strict();
export type Relation = z.infer<typeof RelationSchema>;

/** Any entity that appears on the timeline axis. */
export type TimelineEntity = EventEntity | PersonEntity | WorkEntity;
