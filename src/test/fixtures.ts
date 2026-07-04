/**
 * Shared test fixture: a tiny but structurally complete Dataset exercising
 * every entity kind, the event hierarchy, an open lifespan, both work
 * positioning dates (D7), and the region hierarchy.
 * dataset.test.ts asserts it passes DatasetSchema — keep it valid.
 */
import type { Dataset } from '../domain/dataset';
import { SCHEMA_VERSION } from '../domain/dataset';

export function makeFixtureDataset(): Dataset {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: '2026-01-01T00:00:00.000Z',
    events: [
      {
        id: 'fx-war',
        type: 'event',
        title: { he: 'מלחמה לדוגמה' },
        description: { he: 'אירוע-על עם תתי-אירועים.' },
        dates: { start: '1947-11-30', end: '1949-07-20' },
        importance: 95,
        categoryIds: ['war-security'],
        regionIds: ['israel'],
        links: [],
      },
      {
        id: 'fx-battle',
        type: 'event',
        title: { he: 'קרב לדוגמה' },
        description: { he: 'תת-אירוע של המלחמה.' },
        dates: { start: '1948-05' },
        parentId: 'fx-war',
        importance: 40,
        categoryIds: ['war-security'],
        regionIds: ['jerusalem'],
        links: [],
      },
      {
        id: 'fx-declaration',
        type: 'event',
        title: { he: 'הכרזה לדוגמה' },
        description: { he: 'אירוע נקודתי ברמת דיוק של יום.' },
        dates: { start: '1948-05-14' },
        importance: 100,
        categoryIds: [],
        regionIds: ['tel-aviv'],
        links: [{ label: { he: 'מקור' }, url: 'https://example.org/declaration' }],
      },
    ],
    people: [
      {
        id: 'fx-leader',
        type: 'person',
        name: { he: 'מנהיג לדוגמה' },
        bio: { he: 'ביוגרפיה קצרה.' },
        lifespan: { start: '1886-10-16', end: '1973-12-01' },
        categoryIds: ['leaders'],
        importance: 98,
        regionIds: ['israel'],
        links: [],
      },
      {
        id: 'fx-writer-alive',
        type: 'person',
        name: { he: 'סופר חי לדוגמה' },
        bio: { he: 'נולד ועודנו פעיל.' },
        lifespan: { start: '1954', end: null },
        categoryIds: ['writers'],
        importance: 55,
        regionIds: ['jerusalem'],
        links: [],
      },
    ],
    works: [
      {
        id: 'fx-autobio',
        type: 'work',
        workType: 'autobiography',
        title: { he: 'אוטוביוגרפיה לדוגמה' },
        description: { he: 'המחבר הוא גם הנושא.' },
        authorPersonIds: ['fx-leader'],
        subjectPersonIds: ['fx-leader'],
        subjectEventIds: [],
        publicationDate: '1975',
        coveredPeriod: { start: '1886', end: '1973' },
        importance: 55,
        regionIds: ['israel'],
        links: [],
      },
      {
        id: 'fx-novel',
        type: 'work',
        workType: 'historical-novel',
        title: { he: 'רומן היסטורי לדוגמה' },
        description: { he: 'פורסם ב-2010, מתאר את 1947–1949 (מבחן D7).' },
        authorPersonIds: [],
        authorName: { he: 'מחבר חיצוני' },
        subjectPersonIds: [],
        subjectEventIds: ['fx-war'],
        publicationDate: '2010',
        coveredPeriod: { start: '1947-11', end: '1949' },
        importance: 45,
        regionIds: ['israel'],
        links: [],
      },
    ],
    personCategories: [
      { id: 'leaders', name: { he: 'מנהיגים ומדינאים' }, color: 'leaders' },
      { id: 'writers', name: { he: 'סופרים ומשוררים' }, color: 'writers' },
    ],
    eventCategories: [{ id: 'war-security', name: { he: 'מלחמות וביטחון' }, color: 'war-security' }],
    workTypes: [
      { id: 'biography', name: { he: 'ביוגרפיה' }, color: 'biography' },
      { id: 'autobiography', name: { he: 'אוטוביוגרפיה' }, color: 'autobiography' },
      { id: 'historical-novel', name: { he: 'רומן היסטורי' }, color: 'historical-novel' },
    ],
    regions: [
      { id: 'israel', name: { he: 'ארץ ישראל וישראל' }, kind: 'country' },
      { id: 'jerusalem', name: { he: 'ירושלים' }, kind: 'city', parentId: 'israel' },
      { id: 'tel-aviv', name: { he: 'תל אביב' }, kind: 'city', parentId: 'israel' },
    ],
    relations: [{ from: 'fx-leader', to: 'fx-declaration', type: 'participated-in' }],
    indexes: {
      childrenByEvent: { 'fx-war': ['fx-battle'] },
      worksByPerson: { 'fx-leader': ['fx-autobio'] },
      worksByAuthor: { 'fx-leader': ['fx-autobio'] },
      regionDescendants: {
        israel: ['israel', 'jerusalem', 'tel-aviv'],
        jerusalem: ['jerusalem'],
        'tel-aviv': ['tel-aviv'],
      },
    },
  };
}
