/**
 * Regression (review finding): fetch() resolves on headers — a connection
 * dropped mid-body rejects res.json() with a TypeError, which must classify
 * as 'network' (retryable), not 'invalid-json' (corrupt file).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatasetLoadError } from './DataSource';
import { StaticJsonDataSource } from './StaticJsonDataSource';

function stubFetchJsonRejection(cause: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: () => Promise.reject(cause) })),
  );
}

async function loadErrorKind(): Promise<string> {
  try {
    await new StaticJsonDataSource('test://dataset.json').loadDataset();
  } catch (e) {
    expect(e).toBeInstanceOf(DatasetLoadError);
    return (e as DatasetLoadError).kind;
  }
  throw new Error('expected loadDataset to reject');
}

describe('StaticJsonDataSource body-read failure classification', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('classifies a mid-body network failure (TypeError) as network', async () => {
    stubFetchJsonRejection(new TypeError('network error while reading body'));
    expect(await loadErrorKind()).toBe('network');
  });

  it('still classifies malformed JSON (SyntaxError) as invalid-json', async () => {
    stubFetchJsonRejection(new SyntaxError('Unexpected token'));
    expect(await loadErrorKind()).toBe('invalid-json');
  });
});
