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

  // --- timeline surface (docs/06, docs/08) ---
  timelineRegionLabel: 'ציר הזמן',
  timelineInstructions:
    'מקשי החיצים מזיזים את התצוגה על פני הזמן; פלוס מגדיל, מינוס מקטין; Home חוזר לטווח המלא. מקש Tab מגיע לפריטים עצמם, ו-Enter פותח את פרטי הפריט.',
  zoomIn: 'הגדלת התצוגה',
  zoomOut: 'הקטנת התצוגה',
  resetView: 'טווח מלא',
  visibleRangeLabel: 'הטווח המוצג',
  bandEvents: 'אירועים',
  bandPeople: 'אנשים',
  bandWorks: 'ספרים',
  clusterChip: (n: number) => `+${n} נוספים`,
  clusterAriaLabel: (n: number) =>
    n === 1 ? 'פריט נוסף אחד — הגדלה להצגתו' : `${n} פריטים נוספים — הגדלה להצגתם`,
  emptyViewNotice: 'אין פריטים להצגה בטווח ובסינון הנוכחיים',
  /** Item accessible name: "אירוע: מלחמת העצמאות, 1947–1949". */
  itemAriaLabel: (typeLabel: string, title: string, date: string) => `${typeLabel}: ${title}, ${date}`,
  /** Visual affordance on an open-ended lifespan — never a fabricated end date. */
  ongoingLifespan: 'נמשך עד היום',

  // --- detail surface (docs/08#selection--detail) ---
  detailPanelLabel: 'פרטי הפריט',
  detailPublished: (date: string) => `יצא לאור: ${date}`,
  detailAuthors: (names: string) => `מאת: ${names}`,
  detailWorksAbout: 'ספרים על אישיות זו',
  detailSubjects: 'הספר עוסק ב:',
  detailSubEvents: 'תתי־אירועים',
  detailLinks: 'קישורים',
} as const;
