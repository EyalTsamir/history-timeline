/**
 * The compiled dataset artifact — what scripts/build-content.ts emits to
 * public/data/dataset.json and what the app loads through DataSource.
 *
 * Schema management ("migrations equivalent" for the static-JSON strategy,
 * decision D2): SCHEMA_VERSION is embedded in the artifact and asserted by
 * this schema on load. Policy in scripts/migrations/README.md — breaking
 * shape changes bump the version and ship a codemod for content files.
 */
import { z } from 'zod';
import {
  CategorySchema,
  EntityIdSchema,
  EventSchema,
  PersonSchema,
  RelationSchema,
  WorkSchema,
  WorkTypeDefSchema,
} from './entities';

export const SCHEMA_VERSION = 1;

const IdListIndexSchema = z.record(z.array(EntityIdSchema));

export const DatasetSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    generatedAt: z.string(),
    /** Entity arrays are sorted by timeline start (build guarantee, docs/spec/performance.md). */
    events: z.array(EventSchema),
    people: z.array(PersonSchema),
    works: z.array(WorkSchema),
    personCategories: z.array(CategorySchema),
    eventCategories: z.array(CategorySchema),
    workTypes: z.array(WorkTypeDefSchema),
    relations: z.array(RelationSchema),
    /** Precomputed reverse indexes (docs/spec/domain.md#relationship-strategy). */
    indexes: z
      .object({
        /** parent event id → child event ids (chronological). */
        childrenByEvent: IdListIndexSchema,
        /** person id → ids of works about them (subjectPersonIds reverse). */
        worksByPerson: IdListIndexSchema,
        /** person id → ids of works they authored. */
        worksByAuthor: IdListIndexSchema,
      })
      .strict(),
  })
  .strict();

export type Dataset = z.infer<typeof DatasetSchema>;
export type DatasetIndexes = Dataset['indexes'];
