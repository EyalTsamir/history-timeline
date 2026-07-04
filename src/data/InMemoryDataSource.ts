/**
 * DataSource over a fixed Dataset — for tests and story-style dev harnesses.
 * Clones on construction and per load so no two consumers share references.
 */
import type { Dataset } from '../domain/dataset';
import type { DataSource } from './DataSource';

export class InMemoryDataSource implements DataSource {
  private readonly dataset: Dataset;

  constructor(dataset: Dataset) {
    this.dataset = structuredClone(dataset);
  }

  loadDataset(): Promise<Dataset> {
    return Promise.resolve(structuredClone(this.dataset));
  }
}
