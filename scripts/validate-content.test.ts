/**
 * Content pipeline tests over the fixture trees in scripts/__fixtures__/.
 * Each invalid tree isolates one rule; the valid tree exercises hierarchy,
 * sorting, tie-breaks, indexes, and the underscore-ignoring conventions.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { DatasetSchema, SCHEMA_VERSION } from '../src/domain/dataset';
import { buildDataset, collectContent } from './lib/content';
import type { ContentData } from './lib/content';

// vitest runs from the repo root; import.meta.url is not a file: URL under jsdom.
const fixturesRoot = join(process.cwd(), 'scripts', '__fixtures__');
const tree = (name: string): string => join(fixturesRoot, name);

function collectValid(): ContentData {
  const result = collectContent(tree('valid'));
  expect(result.errors).toEqual([]);
  expect(result.data).not.toBeNull();
  return result.data!;
}

describe('collectContent — valid tree', () => {
  it('collects with no errors and no warnings', () => {
    const result = collectContent(tree('valid'));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.data).not.toBeNull();
  });

  it('counts entities and source files, ignoring _ files and the _templates dir', () => {
    // events/_draft.json and _templates/event.json are malformed on purpose:
    // any attempt to read them would surface as a JSON syntax error.
    const result = collectContent(tree('valid'));
    expect(result.counts).toEqual({
      events: 5,
      people: 2,
      works: 2,
      personCategories: 1,
      eventCategories: 1,
      workTypes: 2,
      relations: 1,
      sourceFiles: 13,
    });
  });

  it('strips underscore comment keys before strict parsing', () => {
    // valid/events/1948-war.json carries a "_comment" key; EventSchema is
    // .strict(), so reaching zero errors proves the key was stripped.
    const data = collectValid();
    expect(data.events.map((e) => e.id)).toContain('1948-war');
  });
});

describe('buildDataset — valid tree', () => {
  it('produces a DatasetSchema-valid artifact with the pinned schema version', () => {
    const dataset = buildDataset(collectValid(), '2026-01-01T00:00:00.000Z');
    expect(DatasetSchema.safeParse(dataset).success).toBe(true);
    expect(dataset.schemaVersion).toBe(SCHEMA_VERSION);
    expect(dataset.generatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('sorts each entity list by timeline start, importance desc on ties', () => {
    const dataset = buildDataset(collectValid());
    // 1936-revolt (imp 80) and 1936-strike (imp 30) share start 1936.0.
    expect(dataset.events.map((e) => e.id)).toEqual([
      '1936-revolt',
      '1936-strike',
      '1948-war',
      '1948-battle',
      '1948-declaration',
    ]);
    expect(dataset.people.map((p) => p.id)).toEqual(['example-leader', 'example-writer']);
    expect(dataset.works.map((w) => w.id)).toEqual(['leader-bio', 'war-novel']);
  });

  it('computes the reverse indexes', () => {
    const dataset = buildDataset(collectValid());
    expect(dataset.indexes.childrenByEvent).toEqual({ '1948-war': ['1948-battle'] });
    expect(dataset.indexes.worksByPerson).toEqual({ 'example-leader': ['leader-bio'] });
    expect(dataset.indexes.worksByAuthor).toEqual({ 'example-writer': ['war-novel'] });
  });
});

describe('collectContent — invalid trees', () => {
  it('dangling-ref: reports an unknown relation endpoint', () => {
    const result = collectContent(tree('dangling-ref'));
    expect(result.data).toBeNull();
    expect(result.errors).toHaveLength(1);
    const relationError = result.errors.find((e) => e.file === 'relations.json');
    expect(relationError?.message).toContain('references unknown entity "nobody"');
  });

  it('duplicate-id: reports a global id collision across entity types', () => {
    const result = collectContent(tree('duplicate-id'));
    expect(result.data).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain('duplicate id "dup"');
    expect(result.errors[0]!.message).toContain('events/dup.json');
    expect(result.errors[0]!.file).toBe('people/dup.json');
  });

  it('bad-date: reports the invalid calendar date at its path', () => {
    const result = collectContent(tree('bad-date'));
    expect(result.data).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.file).toBe('events/1948-bad.json');
    expect(result.errors[0]!.path).toBe('dates.start');
    expect(result.errors[0]!.message).toContain('"1948-13" is not a valid date');
  });

  it('parent-cycle: reports event cycles (incl. self) once each', () => {
    const result = collectContent(tree('parent-cycle'));
    expect(result.data).toBeNull();
    expect(result.errors).toHaveLength(2);
    const messages = result.errors.map((e) => e.message).join('\n');
    expect(messages).toContain('event parentId cycle detected: cycle-a -> cycle-b -> cycle-a');
    expect(messages).toContain('event parentId cycle detected: cycle-self -> cycle-self');
  });

  it('malformed-json: reports the syntax error with the file path, not a throw', () => {
    const result = collectContent(tree('malformed-json'));
    expect(result.data).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.file).toBe('events/broken.json');
    expect(result.errors[0]!.message).toMatch(/JSON syntax error/);
  });
});

describe('collectContent — warnings tree', () => {
  it('flags rubric and filename violations as warnings, not errors', () => {
    const result = collectContent(tree('warnings'));
    expect(result.errors).toEqual([]);
    expect(result.data).not.toBeNull();
    expect(result.warnings).toHaveLength(2);
    const messages = result.warnings.map((w) => w.message).join('\n');
    expect(messages).toContain('sub-event importance (60) >= parent event "parent-event" importance (40)');
    expect(messages).toContain('does not match entity id "right-name"');
    const importanceWarning = result.warnings.find((w) => w.message.includes('sub-event importance'));
    expect(importanceWarning?.file).toBe('events/child-event.json');
  });

  it('treats a missing relations.json as empty and still builds', () => {
    const result = collectContent(tree('warnings'));
    expect(result.data!.relations).toEqual([]);
    const dataset = buildDataset(result.data!);
    expect(DatasetSchema.safeParse(dataset).success).toBe(true);
    expect(dataset.indexes.childrenByEvent).toEqual({ 'parent-event': ['child-event'] });
  });
});
