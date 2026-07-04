import { describe, expect, it } from 'vitest';
import { makeFixtureDataset } from '../test/fixtures';
import { DatasetSchema, SCHEMA_VERSION } from './dataset';

describe('DatasetSchema', () => {
  it('parses the fixture dataset unchanged', () => {
    const dataset = makeFixtureDataset();
    const parsed = DatasetSchema.parse(dataset);
    expect(parsed).toEqual(dataset);
  });

  it('rejects a bumped schemaVersion', () => {
    const result = DatasetSchema.safeParse({
      ...makeFixtureDataset(),
      schemaVersion: SCHEMA_VERSION + 1,
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected the parse to fail');
    expect(result.error.issues.map((i) => i.path.join('.'))).toContain('schemaVersion');
  });

  it('rejects an unknown top-level key (strict)', () => {
    const result = DatasetSchema.safeParse({ ...makeFixtureDataset(), bogus: true });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected the parse to fail');
    expect(result.error.issues.map((i) => i.code)).toContain('unrecognized_keys');
  });
});
