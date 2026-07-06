/**
 * Chip-group filter controls over the dataset taxonomies (docs/spec/filtering.md).
 * Reads/writes the filter store directly; rendered in the sidebar.
 */
import { useId, useMemo } from 'react';
import type { Dataset } from '../domain/dataset';
import type { ContentType } from '../domain/timelineItem';
import { STRINGS } from '../app/strings.he';
import { useFilterStore } from '../state/filterStore';
import { Chip } from './Chip';
import styles from './FilterBar.module.css';

interface ContentTypeOption {
  ct: ContentType;
  label: string;
  dotToken: string;
}

export function FilterBar({ dataset }: { dataset: Dataset }) {
  const baseId = useId();
  const personCategoryIds = useFilterStore((s) => s.personCategoryIds);
  const contentTypes = useFilterStore((s) => s.contentTypes);
  const minImportance = useFilterStore((s) => s.minImportance);
  const togglePersonCategory = useFilterStore((s) => s.togglePersonCategory);
  const toggleContentType = useFilterStore((s) => s.toggleContentType);
  const setMinImportance = useFilterStore((s) => s.setMinImportance);

  const contentTypeOptions = useMemo<ContentTypeOption[]>(
    () => [
      { ct: 'event', label: STRINGS.contentTypeEvents, dotToken: 'event' },
      { ct: 'person', label: STRINGS.contentTypePeople, dotToken: 'person' },
      ...dataset.workTypes.map((wt) => ({ ct: wt.id, label: wt.name.he, dotToken: wt.color })),
    ],
    [dataset],
  );

  const contentTypesHeadingId = `${baseId}-content-types`;
  const personCategoriesHeadingId = `${baseId}-person-categories`;
  const importanceInputId = `${baseId}-min-importance`;

  return (
    <div className={styles.bar}>
      <section className={styles.group} aria-labelledby={contentTypesHeadingId}>
        <h3 id={contentTypesHeadingId} className={styles.groupHeading}>
          {STRINGS.filterContentTypes}
        </h3>
        <ul className={styles.chipList}>
          {contentTypeOptions.map(({ ct, label, dotToken }) => (
            <li key={ct}>
              <Chip
                pressed={contentTypes.has(ct)}
                onToggle={() => toggleContentType(ct)}
                dotToken={dotToken}
              >
                {label}
              </Chip>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.group} aria-labelledby={personCategoriesHeadingId}>
        <h3 id={personCategoriesHeadingId} className={styles.groupHeading}>
          {STRINGS.filterPersonCategories}
        </h3>
        <ul className={styles.chipList}>
          {dataset.personCategories.map((category) => (
            <li key={category.id}>
              <Chip
                pressed={personCategoryIds.has(category.id)}
                onToggle={() => togglePersonCategory(category.id)}
                dotToken={category.color}
              >
                {category.name.he}
              </Chip>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.group}>
        <label htmlFor={importanceInputId} className={styles.groupHeading}>
          {STRINGS.filterMinImportance}
        </label>
        <div className={styles.rangeRow}>
          <input
            id={importanceInputId}
            className={styles.range}
            type="range"
            min={0}
            max={100}
            step={5}
            value={minImportance}
            onChange={(e) => setMinImportance(Number(e.target.value))}
          />
          <output htmlFor={importanceInputId} className={styles.rangeValue}>
            {minImportance}
          </output>
        </div>
      </section>
    </div>
  );
}
