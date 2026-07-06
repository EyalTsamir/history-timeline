/**
 * Application shell (docs/spec/interaction.md layout): header, desktop filter
 * sidebar / mobile filter sheet (single 900px breakpoint, CSS-only), and the
 * timeline workspace. Loads the dataset once through DataSource with a
 * loading | error | ready state machine.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DatasetLoadError } from './data/DataSource';
import type { DataSource, DatasetLoadErrorKind } from './data/DataSource';
import { StaticJsonDataSource } from './data/StaticJsonDataSource';
import type { Dataset } from './domain/dataset';
import { normalizeDataset } from './domain/normalize';
import type { TimelineItem } from './domain/timelineItem';
import { STRINGS } from './app/strings.he';
import { initTimelineStateFromUrl } from './app/urlState';
import { useFilterStore } from './state/filterStore';
import { Button } from './components/Button';
import { EmptyState } from './components/EmptyState';
import { ErrorState } from './components/ErrorState';
import { FilterBar } from './components/FilterBar';
import { Sheet } from './components/Sheet';
import { Spinner } from './components/Spinner';
import { TimelineWorkspace } from './components/TimelineWorkspace';
import styles from './App.module.css';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; kind: DatasetLoadErrorKind | 'unknown' }
  | { phase: 'ready'; dataset: Dataset; items: TimelineItem[] };

interface AppProps {
  /** Injection point for tests; production defaults to the static artifact. */
  dataSource?: DataSource | undefined;
}

export default function App({ dataSource }: AppProps) {
  const source = useMemo(() => dataSource ?? new StaticJsonDataSource(), [dataSource]);
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  // The sheet is a mobile-only surface: when the viewport crosses into the
  // desktop breakpoint (sidebar visible, opener hidden), close it.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return; // jsdom
    const mq = window.matchMedia('(min-width: 900px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setSheetOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });
    source.loadDataset().then(
      (dataset) => {
        if (!cancelled) {
          const items = normalizeDataset(dataset);
          // Seed viewport bounds + apply any shared-link state BEFORE the
          // timeline first renders, so there is no default-view flash.
          initTimelineStateFromUrl(items, dataset);
          setState({ phase: 'ready', dataset, items });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            phase: 'error',
            kind: error instanceof DatasetLoadError ? error.kind : 'unknown',
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source, attempt]);

  const activeFilterCount = useFilterStore(
    (s) =>
      s.regionIds.size + s.personCategoryIds.size + s.contentTypes.size +
      (s.minImportance > 0 ? 1 : 0),
  );

  const ready = state.phase === 'ready' && state.items.length > 0;

  let body: ReactNode;
  if (state.phase === 'loading') {
    body = (
      <div className={styles.stateArea}>
        <Spinner label={STRINGS.loading} />
      </div>
    );
  } else if (state.phase === 'error') {
    body = (
      <div className={styles.stateArea}>
        <ErrorState
          title={STRINGS.errorTitle}
          message={STRINGS.errors[state.kind]}
          retryLabel={STRINGS.retry}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
    );
  } else if (state.items.length === 0) {
    body = (
      <div className={styles.stateArea}>
        <EmptyState title={STRINGS.emptyTitle} message={STRINGS.emptyBody} />
      </div>
    );
  } else {
    body = (
      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label={STRINGS.filtersHeading}>
          <h2 className={styles.sidebarHeading}>{STRINGS.filtersHeading}</h2>
          <FilterBar dataset={state.dataset} />
        </aside>
        <main className={styles.main}>
          <TimelineWorkspace items={state.items} dataset={state.dataset} />
        </main>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div>
          <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
            {STRINGS.appTitle}
          </h1>
          <p className={styles.subtitle}>{STRINGS.appSubtitle}</p>
        </div>
        {ready && (
          <Button className={styles.filterButton} onClick={() => setSheetOpen(true)}>
            {STRINGS.mobileFilterButton}
            {activeFilterCount > 0 && (
              <>
                <span className={styles.badge} aria-hidden="true">
                  {activeFilterCount}
                </span>
                <span className="visually-hidden">
                  {STRINGS.activeFilterCount(activeFilterCount)}
                </span>
              </>
            )}
          </Button>
        )}
      </header>
      {body}
      <footer className={styles.footer}>{STRINGS.curationNote}</footer>
      <Sheet
        open={sheetOpen}
        title={STRINGS.filtersHeading}
        closeLabel={STRINGS.close}
        onClose={() => setSheetOpen(false)}
        fallbackFocusRef={titleRef}
      >
        {state.phase === 'ready' && <FilterBar dataset={state.dataset} />}
      </Sheet>
    </div>
  );
}
