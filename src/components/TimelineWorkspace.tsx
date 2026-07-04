/**
 * The future timeline's workspace. Until the rendering stage lands, it shows
 * a labeled placeholder band plus a modest chronological preview list that
 * proves the pipeline end-to-end: load → validate → normalize → filter.
 */
import { useMemo } from 'react';
import type { Dataset } from '../domain/dataset';
import type { TimelineItem } from '../domain/timelineItem';
import { applyFilters, isFilterActive } from '../domain/filters';
import { STRINGS } from '../app/strings.he';
import { selectFilterState, useFilterStore } from '../state/filterStore';
import { Button } from './Button';
import styles from './TimelineWorkspace.module.css';

const PREVIEW_LIMIT = 50;

interface TimelineWorkspaceProps {
  items: readonly TimelineItem[];
  dataset: Dataset;
}

export function TimelineWorkspace({ items, dataset }: TimelineWorkspaceProps) {
  const filters = useFilterStore(selectFilterState);
  const clearAll = useFilterStore((s) => s.clearAll);

  const filtered = useMemo(
    () => applyFilters(items, filters, dataset.indexes.regionDescendants),
    [items, filters, dataset],
  );

  const contentTypeLabels = useMemo(() => {
    const labels = new Map<string, string>([
      ['event', STRINGS.kindEvent],
      ['person', STRINGS.kindPerson],
    ]);
    for (const wt of dataset.workTypes) labels.set(wt.id, wt.name.he);
    return labels;
  }, [dataset]);

  const preview = filtered.slice(0, PREVIEW_LIMIT);

  return (
    <div className={styles.workspace}>
      <div className={styles.resultsLine}>
        <span>{STRINGS.shownCount(filtered.length, items.length)}</span>
        {isFilterActive(filters) && <Button onClick={clearAll}>{STRINGS.clearAll}</Button>}
      </div>

      <section className={styles.placeholder}>
        <h2 className={styles.placeholderTitle}>{STRINGS.placeholderTitle}</h2>
        <p>{STRINGS.placeholderBody}</p>
      </section>

      <section className={styles.preview}>
        <h2 className={styles.previewHeading}>{STRINGS.previewHeading}</h2>
        <ul className={styles.previewList} aria-label={STRINGS.previewListLabel}>
          {preview.map((item) => (
            <li key={item.id} className={styles.previewRow}>
              <span
                className={styles.dot}
                aria-hidden="true"
                style={{ background: `var(--cat-${item.styleToken})` }}
              />
              <span className={styles.rowTitle}>{item.title}</span>
              <span className={styles.rowDate}>{item.detail.displayDate}</span>
              <span className={styles.rowType}>
                {contentTypeLabels.get(item.contentType) ?? item.contentType}
              </span>
              <span className={styles.rowImportance}>
                {STRINGS.importanceValue(item.importance)}
              </span>
            </li>
          ))}
        </ul>
        {filtered.length > PREVIEW_LIMIT && (
          <p className={styles.truncationNote}>
            {STRINGS.previewTruncated(PREVIEW_LIMIT, filtered.length)}
          </p>
        )}
      </section>
    </div>
  );
}
