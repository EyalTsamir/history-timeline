/**
 * Regression tests from the adversarial review: validator rules added after
 * the first pass — style-token existence, reserved work-type ids — plus the
 * previously-uncovered negative paths for work references and relations.
 * Each test builds a self-contained content tree in a temp directory.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectContent, extractStyleTokens } from './lib/content';

type Json = unknown;

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Write a content tree { relPath: json } into a fresh temp root. */
function writeTree(overrides: Record<string, Json> = {}, omit: string[] = []): string {
  const base: Record<string, Json> = {
    'taxonomies/person-categories.json': [{ id: 'cat-p', name: { he: 'קטגוריה' }, color: 'leaders' }],
    'taxonomies/event-categories.json': [{ id: 'cat-e', name: { he: 'קטגוריה' }, color: 'war-security' }],
    'taxonomies/work-types.json': [{ id: 'biography', name: { he: 'ביוגרפיה' }, color: 'biography' }],
    'taxonomies/regions.json': [{ id: 'reg', name: { he: 'אזור' }, kind: 'country' }],
    'events/ev.json': {
      id: 'ev',
      type: 'event',
      title: { he: 'אירוע' },
      description: { he: 'תיאור.' },
      dates: { start: '1948' },
      importance: 50,
      categoryIds: ['cat-e'],
      regionIds: ['reg'],
      sources: [{ title: { he: 'מקור' } }],
    },
    'people/pe.json': {
      id: 'pe',
      type: 'person',
      name: { he: 'אדם' },
      bio: { he: 'ביוגרפיה.' },
      lifespan: { start: '1900', end: '1980' },
      categoryIds: ['cat-p'],
      importance: 50,
      regionIds: ['reg'],
      sources: [{ title: { he: 'מקור' } }],
    },
    'works/wo.json': {
      id: 'wo',
      type: 'work',
      workType: 'biography',
      title: { he: 'ספר' },
      description: { he: 'תיאור.' },
      authorName: { he: 'מחבר' },
      subjectPersonIds: ['pe'],
      subjectEventIds: ['ev'],
      publicationDate: '1990',
      coveredPeriod: { start: '1900', end: '1980' },
      importance: 40,
      regionIds: ['reg'],
      sources: [{ title: { he: 'מקור' } }],
    },
    'relations.json': [{ from: 'pe', to: 'wo', type: 'related-to' }],
  };
  const files = { ...base, ...overrides };
  const root = mkdtempSync(join(tmpdir(), 'htl-review-'));
  roots.push(root);
  for (const [rel, json] of Object.entries(files)) {
    if (omit.includes(rel)) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, JSON.stringify(json, null, 2));
  }
  return root;
}

const messages = (issues: readonly { message: string }[]) => issues.map((i) => i.message).join('\n');

describe('baseline tree', () => {
  it('is error-free, including a relation legally targeting a work', () => {
    const result = collectContent(writeTree());
    expect(result.errors).toEqual([]);
    expect(result.data).not.toBeNull();
  });
});

describe('style-token validation (opt-in)', () => {
  it('reports taxonomy colors that have no --cat-* token', () => {
    const styleTokens = new Set(['leaders', 'war-security']); // no 'biography'
    const result = collectContent(writeTree(), { styleTokens });
    expect(messages(result.errors)).toContain('--cat-biography');
    expect(result.data).toBeNull();
  });

  it('passes when every color resolves; extractStyleTokens parses --cat-* names', () => {
    const css = ':root { --cat-leaders: #123; --cat-war-security: #456; --cat-biography: #789; }';
    const result = collectContent(writeTree(), { styleTokens: extractStyleTokens(css) });
    expect(result.errors).toEqual([]);
  });
});

describe('reserved work-type ids', () => {
  it('rejects a work type whose id collides with built-in content types', () => {
    const root = writeTree({
      'taxonomies/work-types.json': [
        { id: 'biography', name: { he: 'ביוגרפיה' }, color: 'biography' },
        { id: 'person', name: { he: 'סוג פסול' }, color: 'biography' },
      ],
    });
    const result = collectContent(root);
    expect(messages(result.errors)).toContain('reserved');
  });
});

describe('work reference negative paths', () => {
  it('rejects an unknown workType', () => {
    const result = collectContent(
      writeTree({ 'works/wo.json': { ...require_work(), workType: 'memoir' } }),
    );
    expect(messages(result.errors)).toContain('unknown work type "memoir"');
  });

  it('rejects unknown authorPersonIds and subjectEventIds', () => {
    const result = collectContent(
      writeTree({
        'works/wo.json': {
          ...(require_work() as object),
          authorName: undefined,
          authorPersonIds: ['ghost-author'],
          subjectEventIds: ['ghost-event'],
        },
      }),
    );
    const text = messages(result.errors);
    expect(text).toContain('authorPersonIds[0] references unknown person "ghost-author"');
    expect(text).toContain('subjectEventIds[0] references unknown event "ghost-event"');
  });
});

describe('relation negative paths', () => {
  it('rejects a dangling relation `to`', () => {
    const result = collectContent(
      writeTree({ 'relations.json': [{ from: 'pe', to: 'nobody', type: 'related-to' }] }),
    );
    expect(messages(result.errors)).toContain('[0].to references unknown entity "nobody"');
  });
});

// --- Stage 4 validator rules ------------------------------------------------

/** Full baseline entities with sources, for per-test mutation. */
const evBase = (): Record<string, unknown> => ({
  id: 'ev',
  type: 'event',
  title: { he: 'אירוע' },
  description: { he: 'תיאור.' },
  dates: { start: '1948' },
  importance: 50,
  categoryIds: ['cat-e'],
  regionIds: ['reg'],
  sources: [{ title: { he: 'מקור' } }],
});
const peBase = (): Record<string, unknown> => ({
  id: 'pe',
  type: 'person',
  name: { he: 'אדם' },
  bio: { he: 'ביוגרפיה.' },
  lifespan: { start: '1900', end: '1980' },
  categoryIds: ['cat-p'],
  importance: 50,
  regionIds: ['reg'],
  sources: [{ title: { he: 'מקור' } }],
});

describe('sourcing rule', () => {
  it('requires every entity to cite at least one source', () => {
    const { sources: _omit, ...noSources } = evBase();
    const result = collectContent(writeTree({ 'events/ev.json': noSources }));
    expect(messages(result.errors)).toContain('no sources');
    expect(result.data).toBeNull();
  });

  it('rejects a placeholder source URL', () => {
    const result = collectContent(
      writeTree({
        'events/ev.json': { ...evBase(), sources: [{ title: { he: 'מקור' }, url: 'https://example.com/x' }] },
      }),
    );
    expect(messages(result.errors)).toContain('placeholder');
  });

  it('accepts a source with a real URL and publisher', () => {
    const result = collectContent(
      writeTree({
        'people/pe.json': {
          ...peBase(),
          sources: [
            { title: { he: 'הספרייה הלאומית' }, publisher: 'הספרייה הלאומית', url: 'https://www.nli.org.il/he', kind: 'library' },
          ],
        },
      }),
    );
    expect(result.errors).toEqual([]);
  });
});

describe('date & lifespan sanity', () => {
  it('rejects a date in the future as a likely typo', () => {
    const result = collectContent(writeTree({ 'events/ev.json': { ...evBase(), dates: { start: '2999' } } }));
    expect(messages(result.errors)).toContain('is in the future');
  });

  it('warns on a lifespan longer than 120 years', () => {
    const result = collectContent(
      writeTree({ 'people/pe.json': { ...peBase(), lifespan: { start: '1700', end: '1980' } } }),
    );
    expect(messages(result.warnings)).toContain('lifespan spans');
    expect(result.data).not.toBeNull(); // warning, not error
  });
});

describe('sub-event temporal containment', () => {
  it('warns when a sub-event does not overlap its parent event', () => {
    const result = collectContent(
      writeTree({
        'events/parent.json': { ...evBase(), id: 'parent', dates: { start: '1948', end: '1949' } },
        'events/child.json': { ...evBase(), id: 'child', parentId: 'parent', dates: { start: '1970' } },
      }),
    );
    expect(messages(result.warnings)).toContain('does not overlap parent event "parent"');
    expect(result.data).not.toBeNull();
  });

  it('does not warn when a sub-event falls within its parent', () => {
    const result = collectContent(
      writeTree({
        'events/parent.json': { ...evBase(), id: 'parent', dates: { start: '1948', end: '1949' } },
        'events/child.json': { ...evBase(), id: 'child', parentId: 'parent', dates: { start: '1948-06' } },
      }),
    );
    expect(messages(result.warnings)).not.toContain('does not overlap');
  });
});

describe('relations hygiene', () => {
  it('rejects a self-referential relation', () => {
    const result = collectContent(writeTree({ 'relations.json': [{ from: 'pe', to: 'pe', type: 'related-to' }] }));
    expect(messages(result.errors)).toContain('links "pe" to itself');
    expect(result.data).toBeNull();
  });

  it('warns on a duplicate relation edge', () => {
    const result = collectContent(
      writeTree({
        'relations.json': [
          { from: 'pe', to: 'ev', type: 'participated-in' },
          { from: 'pe', to: 'ev', type: 'participated-in' },
        ],
      }),
    );
    expect(messages(result.warnings)).toContain('duplicate relation');
  });
});

describe('intra-list duplicate references', () => {
  it('warns on a repeated id within a reference list', () => {
    const result = collectContent(
      writeTree({ 'events/ev.json': { ...evBase(), regionIds: ['reg', 'reg'] } }),
    );
    expect(messages(result.warnings)).toContain('duplicate entry "reg" in regionIds');
  });
});

/** The baseline work entity, for per-test mutation. */
function require_work(): Record<string, unknown> {
  return {
    id: 'wo',
    type: 'work',
    workType: 'biography',
    title: { he: 'ספר' },
    description: { he: 'תיאור.' },
    authorName: { he: 'מחבר' },
    subjectPersonIds: ['pe'],
    subjectEventIds: ['ev'],
    publicationDate: '1990',
    coveredPeriod: { start: '1900', end: '1980' },
    importance: 40,
    regionIds: ['reg'],
    sources: [{ title: { he: 'מקור' } }],
  };
}
