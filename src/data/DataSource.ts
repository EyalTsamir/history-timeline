/**
 * Data-access boundary (docs/spec/architecture.md#application-layers).
 * All data enters the app through this interface; MVP ships
 * StaticJsonDataSource, a future API server implements the same contract.
 */
import type { Dataset } from '../domain/dataset';

export interface DataSource {
  loadDataset(): Promise<Dataset>;
}

/** Failure taxonomy — the UI maps each kind to a Hebrew message, never the raw text. */
export type DatasetLoadErrorKind = 'network' | 'http' | 'invalid-json' | 'schema-version' | 'schema';

export class DatasetLoadError extends Error {
  readonly kind: DatasetLoadErrorKind;

  constructor(kind: DatasetLoadErrorKind, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DatasetLoadError';
    this.kind = kind;
  }
}
