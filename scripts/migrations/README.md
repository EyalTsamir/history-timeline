# Schema management — the migrations equivalent of decision D2

The pipeline has no database, so "migrations" are codemods over `content/`.

- `SCHEMA_VERSION` lives in `src/domain/dataset.ts` and is embedded in the compiled
  `public/data/dataset.json`; `DatasetSchema` asserts it with `z.literal`, so the
  app's loader rejects any artifact whose version doesn't match the code it shipped with.
- **Additive** changes (new optional field, new taxonomy entry) do NOT bump the version.
- **Breaking** content-shape changes (rename/remove a field, change a type or meaning) must:
  1. Update the Zod schemas in `src/domain/entities.ts`.
  2. Bump `SCHEMA_VERSION` in `src/domain/dataset.ts`.
  3. Ship a codemod in this directory — `scripts/migrations/NNN-description.ts`
     (`NNN` = zero-padded sequence, e.g. `001-rename-tags-to-keywords.ts`) — that
     rewrites every affected file under `content/` in place.
  4. Run it once (`npx tsx scripts/migrations/NNN-description.ts`), then verify with
     `npm run content:validate` and commit the content diff together with the schema bump.
- Codemods stay in the repo afterwards as the audit trail of shape history.
