/**
 * MVP DataSource (decision D2): fetches the compiled static dataset artifact
 * and validates it. Every failure mode surfaces as a DatasetLoadError with a
 * kind — checked in order: network, http, invalid-json, schema-version
 * (stale deployment signal), schema.
 */
import { ZodError } from 'zod';
import { APP_CONFIG } from '../app/config';
import { DatasetSchema, SCHEMA_VERSION } from '../domain/dataset';
import type { Dataset } from '../domain/dataset';
import { DatasetLoadError } from './DataSource';
import type { DataSource } from './DataSource';

export class StaticJsonDataSource implements DataSource {
  private readonly url: string;

  /**
   * URL override is for tests. Production bundles get the content-addressed
   * dataset.<hash>.json via the __DATASET_URL__ define (vite.config.ts,
   * docs/spec/performance.md immutable caching); outside a Vite transform the stable
   * APP_CONFIG.datasetUrl is the fallback.
   */
  constructor(
    url: string = import.meta.env.BASE_URL +
      (typeof __DATASET_URL__ !== 'undefined' ? __DATASET_URL__ : APP_CONFIG.datasetUrl),
  ) {
    this.url = url;
  }

  async loadDataset(): Promise<Dataset> {
    let res: Response;
    try {
      res = await fetch(this.url);
    } catch (cause) {
      throw new DatasetLoadError('network', `failed to fetch ${this.url}`, cause);
    }
    if (!res.ok) {
      throw new DatasetLoadError('http', `HTTP ${res.status} loading ${this.url}`);
    }

    let raw: unknown;
    try {
      raw = await res.json();
    } catch (cause) {
      // fetch() resolves on headers; a connection dropped mid-body rejects
      // json() with a TypeError, not a SyntaxError — that's a network failure.
      throw new DatasetLoadError(
        cause instanceof SyntaxError ? 'invalid-json' : 'network',
        `${this.url} did not return valid JSON`,
        cause,
      );
    }

    // Version check precedes full validation: a mismatch means a stale
    // deployment (app and artifact out of sync), not corrupt content.
    const found =
      typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)['schemaVersion'] : undefined;
    if (found !== SCHEMA_VERSION) {
      throw new DatasetLoadError(
        'schema-version',
        `dataset schemaVersion is ${String(found)}, expected ${SCHEMA_VERSION} — likely a stale deployment`,
      );
    }

    try {
      return DatasetSchema.parse(raw);
    } catch (cause) {
      if (cause instanceof ZodError) {
        throw new DatasetLoadError('schema', 'dataset failed schema validation', cause);
      }
      throw cause;
    }
  }
}
