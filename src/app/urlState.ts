/**
 * Shareable view state in the URL hash (docs/spec/architecture.md: single-page, no router —
 * `#t=<center>&s=<span>&r=…&pc=…&ct=…&imp=…&sel=…`).
 *
 * - encode/decode are pure and validated: unknown ids are dropped, numbers
 *   sanity-checked; a garbage hash degrades to the default view.
 * - initTimelineStateFromUrl() seeds the three stores once per dataset load.
 * - startTimelineUrlSync() mirrors store changes into the hash (debounced
 *   replaceState — no history spam) and applies externally-changed hashes.
 */
import type { EntityId } from '../domain/entities';
import { SLUG_RE } from '../domain/entities';
import type { Dataset } from '../domain/dataset';
import type { TimelineItem } from '../domain/timelineItem';
import type { FilterState } from '../domain/filters';
import { EMPTY_FILTER_STATE } from '../domain/filters';
import { currentDecimalYear } from '../domain/dates';
import type { TimeWindow } from '../timeline/scale';
import { deriveViewportDefaults, spanYears } from '../timeline/scale';
import { TIMELINE_INTERACTION } from '../timeline/config';
import { APP_CONFIG } from './config';
import { useFilterStore } from '../state/filterStore';
import { useSelectionStore } from '../state/selectionStore';
import { useViewportStore } from '../state/viewportStore';

export interface TimelineUrlState {
  window?: TimeWindow;
  filters?: FilterState;
  selectedId?: EntityId;
}

/** What decode() checks ids against — every dimension validated. */
export interface UrlVocabulary {
  itemIds: ReadonlySet<EntityId>;
  regionIds: ReadonlySet<EntityId>;
  personCategoryIds: ReadonlySet<EntityId>;
  contentTypes: ReadonlySet<string>;
}

export function vocabularyOf(items: readonly TimelineItem[], dataset: Dataset): UrlVocabulary {
  return {
    itemIds: new Set(items.map((i) => i.id)),
    regionIds: new Set(dataset.regions.map((r) => r.id)),
    personCategoryIds: new Set(dataset.personCategories.map((c) => c.id)),
    contentTypes: new Set(['event', 'person', ...dataset.workTypes.map((w) => w.id)]),
  };
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export function encodeTimelineHash(
  window: TimeWindow,
  filters: FilterState,
  selectedId: EntityId | null,
): string {
  const parts: string[] = [];
  parts.push(`t=${round3((window.start + window.end) / 2)}`, `s=${round3(spanYears(window))}`);
  const csv = (set: ReadonlySet<string>): string => [...set].sort().join(',');
  if (filters.regionIds.size > 0) parts.push(`r=${csv(filters.regionIds)}`);
  if (filters.personCategoryIds.size > 0) parts.push(`pc=${csv(filters.personCategoryIds)}`);
  if (filters.contentTypes.size > 0) parts.push(`ct=${csv(filters.contentTypes)}`);
  if (filters.minImportance > 0) parts.push(`imp=${filters.minImportance}`);
  if (selectedId !== null) parts.push(`sel=${selectedId}`);
  return parts.join('&');
}

/** Parse a hash (with or without leading '#'). Invalid pieces are dropped. */
export function decodeTimelineHash(hash: string, vocabulary: UrlVocabulary): TimelineUrlState {
  const params = new Map<string, string>();
  for (const pair of hash.replace(/^#/, '').split('&')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    try {
      params.set(pair.slice(0, eq), decodeURIComponent(pair.slice(eq + 1)));
    } catch {
      // malformed escape — drop the pair
    }
  }

  const state: TimelineUrlState = {};

  const center = Number(params.get('t'));
  const span = Number(params.get('s'));
  if (Number.isFinite(center) && Number.isFinite(span) && span > 0) {
    state.window = { start: center - span / 2, end: center + span / 2 };
  }

  const idSet = (key: string, valid: ReadonlySet<string>): Set<EntityId> => {
    const raw = params.get(key);
    if (raw === undefined || raw === '') return new Set();
    return new Set(raw.split(',').filter((id) => SLUG_RE.test(id) && valid.has(id)));
  };
  const regionIds = idSet('r', vocabulary.regionIds);
  const personCategoryIds = idSet('pc', vocabulary.personCategoryIds);
  const contentTypes = idSet('ct', vocabulary.contentTypes);
  const impRaw = Number(params.get('imp'));
  const minImportance = Number.isInteger(impRaw) ? Math.min(100, Math.max(0, impRaw)) : 0;
  if (regionIds.size > 0 || personCategoryIds.size > 0 || contentTypes.size > 0 || minImportance > 0) {
    state.filters = { regionIds, personCategoryIds, contentTypes, minImportance };
  }

  const sel = params.get('sel');
  if (sel !== undefined && vocabulary.itemIds.has(sel)) state.selectedId = sel;

  return state;
}

/**
 * Seed viewport limits from the data extent + configured content range, then
 * apply whatever the current URL hash validly describes. Runs once per
 * dataset load, before the timeline first renders.
 */
export function initTimelineStateFromUrl(items: readonly TimelineItem[], dataset: Dataset): void {
  const defaults = deriveViewportDefaults(items, APP_CONFIG.contentRange, currentDecimalYear(), {
    minSpan: TIMELINE_INTERACTION.minWindowSpanYears,
    boundsPaddingFraction: TIMELINE_INTERACTION.boundsPaddingFraction,
    resetPaddingFraction: TIMELINE_INTERACTION.resetPaddingFraction,
  });
  useViewportStore.getState().init(defaults);

  const state = decodeTimelineHash(window.location.hash, vocabularyOf(items, dataset));
  if (state.window) useViewportStore.getState().setWindow(state.window);
  useFilterStore.getState().replaceAll(state.filters ?? EMPTY_FILTER_STATE);
  if (state.selectedId !== undefined) useSelectionStore.getState().select(state.selectedId);
  else useSelectionStore.getState().clear();
}

const SYNC_DEBOUNCE_MS = 300;

/**
 * Two-way hash sync. Store changes → debounced history.replaceState;
 * external hash edits (paste, back/forward) → stores. Returns cleanup.
 */
export function startTimelineUrlSync(items: readonly TimelineItem[], dataset: Dataset): () => void {
  const vocabulary = vocabularyOf(items, dataset);
  let lastWritten: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const write = (): void => {
    const hash = `#${encodeTimelineHash(
      useViewportStore.getState().window,
      useFilterStore.getState(),
      useSelectionStore.getState().selectedId,
    )}`;
    // Track what the app considers "ours" on EVERY tick — even when the hash
    // already matches and replaceState is skipped. Otherwise lastWritten goes
    // stale and a later back/forward/paste to that value is wrongly swallowed.
    lastWritten = hash;
    if (hash === window.location.hash) return;
    history.replaceState(null, '', hash);
  };
  const scheduleWrite = (): void => {
    clearTimeout(timer);
    timer = setTimeout(write, SYNC_DEBOUNCE_MS);
  };

  const unsubscribes = [
    useViewportStore.subscribe((s, prev) => {
      if (s.window !== prev.window) scheduleWrite();
    }),
    useFilterStore.subscribe(scheduleWrite),
    useSelectionStore.subscribe(scheduleWrite),
  ];

  const onHashChange = (): void => {
    if (window.location.hash === lastWritten) return;
    const state = decodeTimelineHash(window.location.hash, vocabulary);
    if (state.window) useViewportStore.getState().setWindow(state.window);
    useFilterStore.getState().replaceAll(state.filters ?? EMPTY_FILTER_STATE);
    if (state.selectedId !== undefined) useSelectionStore.getState().select(state.selectedId);
    else useSelectionStore.getState().clear();
  };
  window.addEventListener('hashchange', onHashChange);

  return () => {
    clearTimeout(timer);
    for (const u of unsubscribes) u();
    window.removeEventListener('hashchange', onHashChange);
  };
}
