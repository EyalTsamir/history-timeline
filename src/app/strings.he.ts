/**
 * Every user-facing string in the shell (decision D1: Hebrew-only UI).
 * Components hold no Hebrew literals — they read from here, so adding a
 * language later is a lookup swap, not a component rewrite.
 */
import type { DatasetLoadErrorKind } from '../data/DataSource';

export const STRINGS = {
  appTitle: 'ציר הזמן ההיסטורי',
  appSubtitle: 'ישראל, 1930–2000',

  loading: 'טוען את מאגר הנתונים…',

  errorTitle: 'שגיאה בטעינת הנתונים',
  errors: {
    network: 'החיבור לשרת נכשל. בדקו את חיבור האינטרנט ונסו שוב.',
    http: 'קובץ הנתונים לא נמצא בשרת.',
    'invalid-json': 'קובץ הנתונים שהתקבל פגום ולא ניתן לקרוא אותו.',
    'schema-version': 'גרסת הנתונים אינה תואמת את גרסת היישום. רעננו את הדף ונסו שוב.',
    schema: 'קובץ הנתונים אינו תואם את המבנה הצפוי.',
    unknown: 'אירעה שגיאה בלתי צפויה בטעינת הנתונים.',
  } satisfies Record<DatasetLoadErrorKind | 'unknown', string>,
  retry: 'נסו שוב',

  emptyTitle: 'אין פריטים להצגה',
  emptyBody: 'מאגר הנתונים נטען בהצלחה, אך אינו מכיל פריטים עדיין.',

  filtersHeading: 'סינון',
  filterRegions: 'אזור',
  /** Screen-reader-only suffix exposing region nesting on sub-region chips. */
  regionWithin: (parent: string) => `בתוך ${parent}`,
  filterContentTypes: 'סוג תוכן',
  filterPersonCategories: 'קטגוריית אישים',
  filterMinImportance: 'חשיבות מזערית',
  clearAll: 'נקה הכול',
  mobileFilterButton: 'סינון',
  activeFilterCount: (n: number) => (n === 1 ? 'מסנן פעיל אחד' : `${n} מסננים פעילים`),
  close: 'סגירה',

  contentTypeEvents: 'אירועים',
  contentTypePeople: 'אנשים',
  kindEvent: 'אירוע',
  kindPerson: 'אישיות',

  shownCount: (shown: number, total: number) =>
    shown === 1 ? `מוצג פריט אחד מתוך ${total}` : `מוצגים ${shown} מתוך ${total} פריטים`,
  importanceValue: (n: number) => `חשיבות ${n}`,

  // --- timeline surface (docs/14 guided expedition) ---
  timelineRegionLabel: 'ציר הזמן',
  timelineInstructions:
    'מקשי החיצים מזיזים את התצוגה על פני הזמן; פלוס צולל לרמת תקריב קרובה, מינוס מרחיק; Home חוזר למבט המאה. מקש Tab מגיע לפריטים עצמם, ו-Enter פותח את פרטי הפריט.',
  zoomIn: 'התקרבות',
  zoomOut: 'התרחקות',
  resetView: 'טווח מלא',
  visibleRangeLabel: 'הטווח המוצג',
  emptyViewNotice: 'אין פריטים להצגה בטווח ובסינון הנוכחיים',
  /** Item accessible name: "אירוע: מלחמת העצמאות, 1947–1949". */
  itemAriaLabel: (typeLabel: string, title: string, date: string) => `${typeLabel}: ${title}, ${date}`,
  /** Visual affordance on an open-ended lifespan — never a fabricated end date. */
  ongoingLifespan: 'נמשך עד היום',

  // --- altitudes (docs/14 §3) ---
  altitudeControlLabel: 'רמת התקריב',
  altitudeNames: {
    century: 'מאה',
    decade: 'עשור',
    year: 'שנה',
  } as Record<'century' | 'decade' | 'year', string>,

  // --- eras & century strip (docs/14 §6) ---
  eraNames: {
    mandate: 'המנדט הבריטי',
    independence: 'קוממיות',
    statebuilding: 'בניין המדינה',
    wars: 'מלחמות והתפכחות',
    upheaval: 'המהפך והשלום',
    oslo: 'שנות אוסלו',
  } as Record<string, string>,
  centuryStripLabel: 'מפת המאה',
  /** Readout era slot at the century altitude — the whole range is in view. */
  readoutWholeRange: 'כל המאה',
  /** Accessible label of the brush marking the visible window on the strip. */
  stripWindowLabel: 'החלון המוצג',
  eraChipsLabel: 'קפיצה לתקופה',
  eraChipAria: (name: string, from: number, to: number) => `${name}, ${from}–${to}`,

  // --- event field (docs/14 §4) ---
  chapterBadge: (n: number) => (n === 1 ? 'פרק אחד' : `${n} פרקים`),
  chapterMore: (n: number) => `עוד ${n}`,
  chapterMoreAria: (n: number, title: string) =>
    n === 1 ? `הצגת פרק נוסף אחד של ${title}` : `הצגת עוד ${n} פרקים של ${title}`,
  chapterCollapse: 'צמצום',
  chapterCollapseAria: (title: string) => `צמצום הפרקים של ${title}`,

  /** Aggregated dot (docs/14 §4): the bucket's weightiest item + how many more share it. */
  dotAggregateSuffix: (n: number) => (n === 1 ? ' ועוד פריט סמוך אחד' : ` ועוד ${n} פריטים סמוכים`),

  // --- cast strip & period shelf (docs/14 §5) ---
  castTitle: 'מי בתמונה',
  shelfTitle: 'מדף התקופה',
  presenceMore: (n: number) => `עוד ${n}`,
  presenceMoreAria: (n: number) => (n === 1 ? 'הצגת פריט נוסף אחד' : `הצגת עוד ${n} פריטים`),
  presenceCollapse: 'צמצום',

  // --- mobile chronicle (docs/14 §7) ---
  chronicleRegionLabel: 'כרוניקת ציר הזמן',
  chronicleEraYears: (from: number, to: number) => `${from}–${to}`,

  // --- detail surface (docs/08#selection--detail) ---
  detailPanelLabel: 'פרטי הפריט',
  detailPublished: (date: string) => `יצא לאור: ${date}`,
  detailAuthors: (names: string) => `מאת: ${names}`,
  detailWorksAbout: 'ספרים על אישיות זו',
  detailSubjects: 'הספר עוסק ב:',
  detailSubEvents: 'תתי־אירועים',
  detailSources: 'מקורות',
  detailLinks: 'קישורים',
  /** Curation disclaimer (docs/01) — the content is selective, not exhaustive. */
  curationNote: 'תוכן נבחר ומתעדכן — מבחר מייצג, לא רשימה ממצה.',
} as const;
