import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION } from '../domain/dataset';
import { makeFixtureDataset } from '../test/fixtures';
import { DatasetLoadError } from './DataSource';
import { StaticJsonDataSource } from './StaticJsonDataSource';

const TEST_URL = 'https://example.test/data/dataset.json';

/** Minimal Response stand-in — the source only touches ok/status/json(). */
function jsonResponse(body: unknown, status = 200): unknown {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

function stubFetch(result: Promise<unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => result),
  );
}

async function loadError(source: StaticJsonDataSource): Promise<unknown> {
  try {
    await source.loadDataset();
  } catch (e) {
    return e;
  }
  throw new Error('expected loadDataset to reject');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StaticJsonDataSource', () => {
  it('returns the parsed Dataset on success', async () => {
    stubFetch(Promise.resolve(jsonResponse(makeFixtureDataset())));
    const dataset = await new StaticJsonDataSource(TEST_URL).loadDataset();
    expect(dataset).toEqual(makeFixtureDataset());
    expect(fetch).toHaveBeenCalledWith(TEST_URL);
  });

  it('maps a non-ok response to kind "http"', async () => {
    stubFetch(Promise.resolve(jsonResponse({}, 404)));
    const err = await loadError(new StaticJsonDataSource(TEST_URL));
    expect(err).toBeInstanceOf(DatasetLoadError);
    expect((err as DatasetLoadError).kind).toBe('http');
  });

  it('maps a fetch rejection to kind "network"', async () => {
    stubFetch(Promise.reject(new TypeError('failed to fetch')));
    const err = await loadError(new StaticJsonDataSource(TEST_URL));
    expect(err).toBeInstanceOf(DatasetLoadError);
    expect((err as DatasetLoadError).kind).toBe('network');
  });

  it('maps a JSON parse failure to kind "invalid-json"', async () => {
    stubFetch(
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
      }),
    );
    const err = await loadError(new StaticJsonDataSource(TEST_URL));
    expect(err).toBeInstanceOf(DatasetLoadError);
    expect((err as DatasetLoadError).kind).toBe('invalid-json');
  });

  it('maps a schemaVersion mismatch to kind "schema-version"', async () => {
    stubFetch(Promise.resolve(jsonResponse({ ...makeFixtureDataset(), schemaVersion: SCHEMA_VERSION + 1 })));
    const err = await loadError(new StaticJsonDataSource(TEST_URL));
    expect(err).toBeInstanceOf(DatasetLoadError);
    expect((err as DatasetLoadError).kind).toBe('schema-version');
  });

  it('maps a structurally invalid body with the right version to kind "schema"', async () => {
    stubFetch(
      Promise.resolve(jsonResponse({ ...makeFixtureDataset(), events: 'not-an-array' })),
    );
    const err = await loadError(new StaticJsonDataSource(TEST_URL));
    expect(err).toBeInstanceOf(DatasetLoadError);
    expect((err as DatasetLoadError).kind).toBe('schema');
  });
});
