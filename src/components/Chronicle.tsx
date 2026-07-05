/**
 * The mobile chronicle (docs/14 §7): below the desktop breakpoint the canvas
 * is replaced by a vertical feed — scroll IS movement through time. Era
 * sections → sticky year headings → entries sized by importance tier;
 * sub-events fold into their parent's chapter card ("עוד N" expands in
 * place); each era opens with its cast row and closes with its shelf card.
 *
 * Viewport sync: the year heading nearest the top of the screen writes a
 * coarse window into viewportStore (scroll spy), so the century strip brush
 * tracks the scroll and shared URLs carry position across form factors; on
 * mount the feed scrolls to the URL's year.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ERAS, eraAt } from '../app/eras';
import type { Era } from '../app/eras';
import { STRINGS } from '../app/strings.he';
import { currentDecimalYear } from '../domain/dates';
import type { EntityId } from '../domain/entities';
import type { TimelineItem } from '../domain/timelineItem';
import type { ImportanceTier } from '../timeline/altitude';
import { tierOf } from '../timeline/altitude';
import { partitionByTopmost } from '../timeline/fieldLayout';
import { castForWindow, shelfForWindow } from '../timeline/presence';
import { spanYears } from '../timeline/scale';
import { useSelectionStore } from '../state/selectionStore';
import { useViewportStore } from '../state/viewportStore';
import styles from './Chronicle.module.css';

/** Collapsed chapter cards list this many children before "עוד N". */
const CHAPTER_COLLAPSED_CHILDREN = 3;
const CAST_TOP_N = 6;
const SHELF_TOP_N = 4;
/** The coarse window a scrolled-to year writes into the viewport store. */
const SPY_WINDOW_SPAN = 2;

interface ChronicleProps {
  items: readonly TimelineItem[];
  typeLabels: ReadonlyMap<string, string>;
}

type Entry =
  | { kind: 'single'; item: TimelineItem; tier: ImportanceTier }
  | { kind: 'chapter'; item: TimelineItem; tier: ImportanceTier; children: TimelineItem[] };

interface YearGroup {
  year: number;
  entries: Entry[];
}

interface EraSection {
  era: Era;
  cast: TimelineItem[];
  shelf: TimelineItem[];
  years: YearGroup[];
}

function buildSections(items: readonly TimelineItem[], openEndYear: number): EraSection[] {
  const events = items.filter((i) => i.kind === 'event');
  const { topLevel, childrenByTop } = partitionByTopmost(events);

  const sections: EraSection[] = [];
  for (const era of ERAS) {
    const inEra = topLevel.filter((e) => eraAt(e.start).id === era.id);
    const byYear = new Map<number, Entry[]>();
    for (const item of inEra) {
      const children = childrenByTop.get(item.id);
      const entry: Entry =
        children !== undefined
          ? { kind: 'chapter', item, tier: tierOf(item.importance), children: [...children].sort(byStart) }
          : { kind: 'single', item, tier: tierOf(item.importance) };
      const year = Math.floor(item.start);
      const list = byYear.get(year);
      if (list) list.push(entry);
      else byYear.set(year, [entry]);
    }
    const years = [...byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, entries]) => ({ year, entries: entries.sort((a, b) => byStart(a.item, b.item)) }));

    const eraRange = { start: era.start, end: era.end };
    const cast = castForWindow(items, eraRange, openEndYear, CAST_TOP_N).top;
    const shelf = shelfForWindow(items, eraRange, openEndYear, SHELF_TOP_N).top;
    if (years.length > 0 || cast.length > 0 || shelf.length > 0) {
      sections.push({ era, cast, shelf, years });
    }
  }
  return sections;
}

function byStart(a: TimelineItem, b: TimelineItem): number {
  return a.start - b.start || a.id.localeCompare(b.id);
}

const itemColor = (item: TimelineItem): CSSProperties =>
  ({ '--item-color': `var(--cat-${item.styleToken})` }) as CSSProperties;

export function Chronicle({ items, typeLabels }: ChronicleProps) {
  const select = useSelectionStore((s) => s.select);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const setWindow = useViewportStore((s) => s.setWindow);
  const openEndYear = useMemo(() => currentDecimalYear(), []);
  const sections = useMemo(() => buildSections(items, openEndYear), [items, openEndYear]);
  const [expandedChapters, setExpandedChapters] = useState<ReadonlySet<EntityId>>(new Set());
  const rootRef = useRef<HTMLElement | null>(null);
  /** Blocks the scroll spy while the initial URL-driven scroll settles. */
  const spyEnabled = useRef(false);
  /** Marks window writes coming from the spy itself (vs. strip/era-chip jumps). */
  const internalWrite = useRef(false);

  const label = (item: TimelineItem): string =>
    STRINGS.itemAriaLabel(
      typeLabels.get(item.contentType) ?? item.contentType,
      item.title,
      item.detail.displayDate,
    );

  // --- initial position: land on the URL's year, then arm the scroll spy ----
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const { window: win, defaultWindow } = useViewportStore.getState();
    const isDefault =
      Math.abs(win.start - defaultWindow.start) < 1e-6 && Math.abs(win.end - defaultWindow.end) < 1e-6;
    if (!isDefault && spanYears(win) < spanYears(defaultWindow) * 0.8) {
      const center = (win.start + win.end) / 2;
      const headings = [...root.querySelectorAll<HTMLElement>('[data-year]')];
      const target =
        [...headings].reverse().find((h) => Number(h.dataset.year) <= center) ?? headings[0];
      target?.scrollIntoView({ block: 'start' });
    }
    const arm = requestAnimationFrame(() => {
      spyEnabled.current = true;
    });
    return () => cancelAnimationFrame(arm);
  }, []);

  // --- scroll spy: the year heading at/above the fold drives the window ------
  // (Sticky headings pin to y≈0, so "last heading whose top cleared the fold
  // line" is the current year — an IntersectionObserver band would miss the
  // pinned state entirely.)
  useEffect(() => {
    let raf = 0;
    const onScroll = (): void => {
      if (raf !== 0) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!spyEnabled.current) return;
        const root = rootRef.current;
        if (root === null) return;
        let current: number | null = null;
        for (const heading of root.querySelectorAll<HTMLElement>('[data-year]')) {
          if (heading.getBoundingClientRect().top <= 130) current = Number(heading.dataset.year);
          else break; // headings are chronological down the feed
        }
        if (current !== null && Number.isFinite(current)) {
          internalWrite.current = true;
          setWindow({
            start: current - (SPY_WINDOW_SPAN - 1) / 2,
            end: current + (SPY_WINDOW_SPAN + 1) / 2,
          });
          internalWrite.current = false;
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [sections, setWindow]);

  // --- external window jumps (era chips, strip taps, pasted URLs) → scroll --
  useEffect(() => {
    const unsubscribe = useViewportStore.subscribe((s, prev) => {
      if (s.window === prev.window || internalWrite.current) return;
      const root = rootRef.current;
      if (root === null) return;
      const center = (s.window.start + s.window.end) / 2;
      const headings = [...root.querySelectorAll<HTMLElement>('[data-year]')];
      const target =
        [...headings].reverse().find((h) => Number(h.dataset.year) <= center) ?? headings[0];
      target?.scrollIntoView({ block: 'start' });
    });
    return unsubscribe;
  }, []);

  // --- related-item navigation: bring an off-screen selection into view -----
  useEffect(() => {
    if (selectedId === null) return;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-item-id="${selectedId}"]`);
    if (el === null || el === undefined) return;
    const rect = el.getBoundingClientRect();
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    if (rect.bottom < 0 || rect.top > viewportH) el.scrollIntoView({ block: 'center' });
  }, [selectedId]);

  const toggleChapter = (id: EntityId): void => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderEntry = (entry: Entry): React.ReactNode => {
    const { item, tier } = entry;
    const selected = item.id === selectedId;
    const typeLabel = typeLabels.get(item.contentType) ?? item.contentType;

    if (entry.kind === 'chapter') {
      const expanded = expandedChapters.has(item.id);
      const shown = expanded ? entry.children : entry.children.slice(0, CHAPTER_COLLAPSED_CHILDREN);
      const hidden = entry.children.length - shown.length;
      return (
        <div key={item.id} className={styles.chapterCard} style={itemColor(item)}>
          <button
            type="button"
            className={selected ? `${styles.chapterHead} ${styles.selected}` : styles.chapterHead}
            data-item-id={item.id}
            aria-current={selected ? 'true' : undefined}
            onClick={() => select(item.id)}
          >
            <span className={styles.kind}>{STRINGS.chapterBadge(entry.children.length)}</span>
            <span className={styles.cardTitle}>{item.title}</span>
            <span className={styles.cardDate}>{item.detail.displayDate}</span>
          </button>
          <ul className={styles.chapterChildren}>
            {shown.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  className={
                    child.id === selectedId ? `${styles.childRow} ${styles.selected}` : styles.childRow
                  }
                  data-item-id={child.id}
                  aria-current={child.id === selectedId ? 'true' : undefined}
                  aria-label={label(child)}
                  onClick={() => select(child.id)}
                >
                  <span className={styles.childTitle}>{child.title}</span>
                  <span className={styles.childDate}>{child.detail.displayDate}</span>
                </button>
              </li>
            ))}
          </ul>
          {(hidden > 0 || expanded) && (
            <button
              type="button"
              className={styles.chapterFold}
              aria-label={
                expanded ? STRINGS.chapterCollapseAria(item.title) : STRINGS.chapterMoreAria(hidden, item.title)
              }
              onClick={() => toggleChapter(item.id)}
            >
              {expanded ? STRINGS.chapterCollapse : STRINGS.chapterMore(hidden)}
            </button>
          )}
        </div>
      );
    }

    if (tier === 'seal' || tier === 'anchor') {
      return (
        <button
          key={item.id}
          type="button"
          className={selected ? `${styles.anchorCard} ${styles.selected}` : styles.anchorCard}
          style={itemColor(item)}
          data-item-id={item.id}
          aria-current={selected ? 'true' : undefined}
          onClick={() => select(item.id)}
        >
          <span className={tier === 'seal' ? `${styles.kind} ${styles.kindSeal}` : styles.kind}>
            {typeLabel}
          </span>
          <span className={styles.anchorTitle}>{item.title}</span>
          <span className={styles.cardDate}>{item.detail.displayDate}</span>
          <span className={styles.anchorBody}>{item.detail.description}</span>
        </button>
      );
    }

    if (tier === 'major') {
      return (
        <button
          key={item.id}
          type="button"
          className={selected ? `${styles.card} ${styles.selected}` : styles.card}
          style={itemColor(item)}
          data-item-id={item.id}
          aria-current={selected ? 'true' : undefined}
          onClick={() => select(item.id)}
        >
          <span className={styles.cardTitle}>{item.title}</span>
          <span className={styles.cardDate}>{item.detail.displayDate}</span>
        </button>
      );
    }

    return (
      <button
        key={item.id}
        type="button"
        className={selected ? `${styles.row} ${styles.selected}` : styles.row}
        style={itemColor(item)}
        data-item-id={item.id}
        aria-current={selected ? 'true' : undefined}
        aria-label={label(item)}
        onClick={() => select(item.id)}
      >
        <span className={styles.rowDot} aria-hidden="true" />
        <span className={styles.rowTitle}>{item.title}</span>
        <span className={styles.rowDate}>{item.detail.displayDate}</span>
      </button>
    );
  };

  return (
    <section ref={rootRef} className={styles.chronicle} aria-label={STRINGS.chronicleRegionLabel}>
      {sections.map(({ era, cast, shelf, years }) => (
        <section key={era.id} className={styles.eraSection} aria-label={STRINGS.eraNames[era.id]}>
          <header className={styles.eraHeader}>
            <h2 className={styles.eraName}>{STRINGS.eraNames[era.id]}</h2>
            <span className={styles.eraYears}>
              {STRINGS.chronicleEraYears(era.displayStart, era.displayEnd)}
            </span>
          </header>

          {cast.length > 0 && (
            <div className={styles.castRow}>
              <span className={styles.presenceTitle}>{STRINGS.castTitle}</span>
              <div className={styles.castChips}>
                {cast.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className={
                      person.id === selectedId ? `${styles.person} ${styles.selected}` : styles.person
                    }
                    style={itemColor(person)}
                    data-item-id={person.id}
                    aria-current={person.id === selectedId ? 'true' : undefined}
                    onClick={() => select(person.id)}
                  >
                    <i className={styles.avatar} aria-hidden="true">
                      {person.title.slice(0, 1)}
                    </i>
                    {person.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {years.map(({ year, entries }) => (
            <div key={year} className={styles.yearGroup}>
              <h3 className={styles.yearHeading} data-year={year}>
                {year}
              </h3>
              <div className={styles.entries}>{entries.map(renderEntry)}</div>
            </div>
          ))}

          {shelf.length > 0 && (
            <div className={styles.shelfCard}>
              <span className={styles.presenceTitle}>{STRINGS.shelfTitle}</span>
              <ul className={styles.shelfList}>
                {shelf.map((work) => (
                  <li key={work.id}>
                    <button
                      type="button"
                      className={
                        work.id === selectedId ? `${styles.book} ${styles.selected}` : styles.book
                      }
                      style={itemColor(work)}
                      data-item-id={work.id}
                      aria-current={work.id === selectedId ? 'true' : undefined}
                      onClick={() => select(work.id)}
                    >
                      <i className={styles.spine} aria-hidden="true" />
                      <span className={styles.bookTitle}>{work.title}</span>
                      {work.detail.authorNames?.[0] !== undefined && (
                        <span className={styles.bookAuthor}>{work.detail.authorNames[0]}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}
    </section>
  );
}
