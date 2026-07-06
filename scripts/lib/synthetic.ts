/**
 * Synthetic dataset generator for PERFORMANCE testing only (docs/spec/performance.md guardrail).
 *
 * This produces an in-memory `Dataset` of arbitrary size with a realistic
 * importance pyramid and time spread. It is NEVER written to `content/` or
 * `public/data/` and never enters a production build — it is consumed only by
 * the profiling harness (`scripts/bench-synthetic.ts`) and the Playwright
 * performance guardrail (which serves it via route interception). Deterministic
 * (seeded LCG) so runs and CI assertions are reproducible.
 */
import type { Dataset } from '../../src/domain/dataset';
import type { EventEntity, PersonEntity, WorkEntity } from '../../src/domain/entities';

export function makeSyntheticDataset(n: number, seed = 1): Dataset {
  let s = seed >>> 0;
  const rnd = (): number => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
  const cats = ['syn-a', 'syn-b', 'syn-c', 'syn-d'] as const;
  const regions = ['syn-r1', 'syn-r2', 'syn-r3'] as const;
  // Year precision keeps every generated range well-ordered (start ≤ end) —
  // random month/day on both ends could otherwise reverse within a year.
  const date = (y: number): string => `${y}`;
  const year = (): number => 1900 + Math.floor(rnd() * 100); // 1900–1999
  const importance = (): number => {
    const r = rnd();
    if (r < 0.03) return 90 + Math.floor(rnd() * 11);
    if (r < 0.15) return 70 + Math.floor(rnd() * 20);
    if (r < 0.5) return 40 + Math.floor(rnd() * 30);
    if (r < 0.85) return 20 + Math.floor(rnd() * 20);
    return 1 + Math.floor(rnd() * 19);
  };

  const events: EventEntity[] = [];
  const people: PersonEntity[] = [];
  const works: WorkEntity[] = [];
  for (let i = 0; i < n; i++) {
    const k = rnd();
    const y = year();
    if (k < 0.6) {
      const y2 = Math.min(1999, y + Math.floor(rnd() * 5));
      events.push({
        id: `syn-e-${i}`, type: 'event',
        title: { he: `אירוע ${i}` }, description: { he: 'תיאור סינתטי לבדיקת ביצועים.' },
        dates: { start: date(y), end: date(y2) }, importance: importance(),
        categoryIds: [pick(cats)], regionIds: [pick(regions)], sources: [],
      });
    } else if (k < 0.85) {
      const d = Math.min(2000, y + 40 + Math.floor(rnd() * 40));
      people.push({
        id: `syn-p-${i}`, type: 'person',
        name: { he: `אדם ${i}` }, bio: { he: 'ביוגרפיה סינתטית.' },
        lifespan: { start: date(y), end: date(d) }, importance: importance(),
        categoryIds: [pick(cats)], regionIds: [pick(regions)], sources: [],
      });
    } else {
      const y2 = Math.min(1999, y + Math.floor(rnd() * 10));
      works.push({
        id: `syn-w-${i}`, type: 'work', workType: 'syn-wt',
        title: { he: `ספר ${i}` }, description: { he: 'תיאור סינתטי.' },
        authorName: { he: 'מחבר' }, authorPersonIds: [], subjectPersonIds: [], subjectEventIds: [],
        publicationDate: date(y2), coveredPeriod: { start: date(y), end: date(y2) },
        importance: importance(), regionIds: [pick(regions)], sources: [],
      });
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: '2000-01-01T00:00:00.000Z',
    events, people, works,
    personCategories: cats.map((c) => ({ id: c, name: { he: c }, color: 'leaders' })),
    eventCategories: cats.map((c) => ({ id: c, name: { he: c }, color: 'war-security' })),
    workTypes: [{ id: 'syn-wt', name: { he: 'סוג' }, color: 'biography' }],
    regions: regions.map((r) => ({ id: r, name: { he: r }, kind: 'country' as const })),
    relations: [],
    indexes: {
      childrenByEvent: {},
      worksByPerson: {},
      worksByAuthor: {},
      regionDescendants: Object.fromEntries(regions.map((r) => [r, [r]])),
    },
  };
}
