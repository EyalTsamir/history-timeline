/**
 * Chip-group filter controls over the dataset taxonomies (docs/spec/filtering.md).
 * Reads/writes the filter store directly; rendered once in the desktop sidebar
 * and again inside the mobile Sheet — both bind to the same store.
 */
import { useId, useMemo } from 'react';
import type { Dataset } from '../domain/dataset';
import type { EntityId, Region } from '../domain/entities';
import type { ContentType } from '../domain/timelineItem';
import { STRINGS } from '../app/strings.he';
import { useFilterStore } from '../state/filterStore';
import { Chip } from './Chip';
import styles from './FilterBar.module.css';

interface RegionRow {
  region: Region;
  depth: number;
  /** Direct parent's display name — read to screen readers, since the visual
   *  indent is the only other signal of nesting (docs/spec/interaction.md: never one signal). */
  parentName?: string;
}

/** Flatten the region hierarchy depth-first, preserving dataset order. */
function flattenRegions(regions: readonly Region[]): RegionRow[] {
  const ids = new Set(regions.map((r) => r.id));
  const children = new Map<EntityId, Region[]>();
  const roots: Region[] = [];
  for (const r of regions) {
    if (r.parentId !== undefined && ids.has(r.parentId)) {
      const list = children.get(r.parentId);
      if (list) list.push(r);
      else children.set(r.parentId, [r]);
    } else {
      roots.push(r);
    }
  }
  const rows: RegionRow[] = [];
  const visit = (region: Region, depth: number, parentName?: string): void => {
    rows.push(parentName !== undefined ? { region, depth, parentName } : { region, depth });
    for (const child of children.get(region.id) ?? []) visit(child, depth + 1, region.name.he);
  };
  for (const root of roots) visit(root, 0);
  return rows;
}

interface ContentTypeOption {
  ct: ContentType;
  label: string;
  dotToken: string;
}

export function FilterBar({ dataset }: { dataset: Dataset }) {
  const baseId = useId();
  const regionIds = useFilterStore((s) => s.regionIds);
  const personCategoryIds = useFilterStore((s) => s.personCategoryIds);
  const contentTypes = useFilterStore((s) => s.contentTypes);
  const minImportance = useFilterStore((s) => s.minImportance);
  const toggleRegion = useFilterStore((s) => s.toggleRegion);
  const togglePersonCategory = useFilterStore((s) => s.togglePersonCategory);
  const toggleContentType = useFilterStore((s) => s.toggleContentType);
  const setMinImportance = useFilterStore((s) => s.setMinImportance);

  const regionRows = useMemo(() => flattenRegions(dataset.regions), [dataset]);
  const contentTypeOptions = useMemo<ContentTypeOption[]>(
    () => [
      { ct: 'event', label: STRINGS.contentTypeEvents, dotToken: 'event' },
      { ct: 'person', label: STRINGS.contentTypePeople, dotToken: 'person' },
      ...dataset.workTypes.map((wt) => ({ ct: wt.id, label: wt.name.he, dotToken: wt.color })),
    ],
    [dataset],
  );

  const regionsHeadingId = `${baseId}-regions`;
  const contentTypesHeadingId = `${baseId}-content-types`;
  const personCategoriesHeadingId = `${baseId}-person-categories`;
  const importanceInputId = `${baseId}-min-importance`;

  return (
    <div className={styles.bar}>
      <section className={styles.group} aria-labelledby={regionsHeadingId}>
        <h3 id={regionsHeadingId} className={styles.groupHeading}>
          {STRINGS.filterRegions}
        </h3>
        <ul className={[styles.chipList, styles.regionList].join(' ')}>
          {regionRows.map(({ region, depth, parentName }) => (
            <li
              key={region.id}
              style={depth > 0 ? { paddingInlineStart: `${depth}rem` } : undefined}
            >
              <Chip pressed={regionIds.has(region.id)} onToggle={() => toggleRegion(region.id)}>
                {region.name.he}
                {parentName !== undefined && (
                  <span className="visually-hidden">{STRINGS.regionWithin(parentName)}</span>
                )}
              </Chip>
            </li>
          ))}
        </ul>
      </section>

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
