/**
 * Lightweight item detail (docs/spec/interaction.md#selection--detail) — the BODY only; the
 * hosting surface (desktop side panel / mobile bottom sheet) owns the title
 * and close affordance. Shows precision-aware dates, type/category chips,
 * description, image, embedded video (events, rare), cited sources, and the one relationship traversal the
 * MVP exposes: person ↔ works, event → sub-events. Related items are buttons
 * that re-select and pan the timeline.
 */
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { STRINGS } from '../app/strings.he';
import type { Dataset } from '../domain/dataset';
import type { EntityId } from '../domain/entities';
import type { TimelineItem } from '../domain/timelineItem';
import styles from './DetailPanel.module.css';

interface DetailPanelProps {
  item: TimelineItem;
  dataset: Dataset;
  typeLabels: ReadonlyMap<string, string>;
  itemById: ReadonlyMap<EntityId, TimelineItem>;
  onSelectRelated: (id: EntityId) => void;
}

export function DetailPanel({ item, dataset, typeLabels, itemById, onSelectRelated }: DetailPanelProps) {
  const categoryNames = useMemo(() => {
    const names = new Map<EntityId, string>();
    for (const c of dataset.personCategories) names.set(c.id, c.name.he);
    for (const c of dataset.eventCategories) names.set(c.id, c.name.he);
    return names;
  }, [dataset]);

  const relatedList = (heading: string, ids: readonly EntityId[]): ReactNode => {
    const related = ids.map((id) => itemById.get(id)).filter((i): i is TimelineItem => i !== undefined);
    if (related.length === 0) return null;
    return (
      <section className={styles.section}>
        <h3 className={styles.sectionHeading}>{heading}</h3>
        <ul className={styles.relatedList}>
          {related.map((r) => (
            <li key={r.id}>
              <button type="button" className={styles.relatedButton} onClick={() => onSelectRelated(r.id)}>
                <span className={styles.relatedTitle}>{r.title}</span>
                <span className={styles.relatedDate}>{r.detail.displayDate}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  const { detail } = item;
  return (
    <div className={styles.body}>
      <p className={styles.date}>
        {detail.displayDate}
        {item.kind === 'person' && item.end === null && (
          <span className={styles.ongoing}> ({STRINGS.ongoingLifespan})</span>
        )}
      </p>

      <ul className={styles.chips}>
        <li className={styles.chip}>
          <span
            className={styles.chipDot}
            style={{ background: `var(--cat-${item.styleToken})` }}
            aria-hidden="true"
          />
          {typeLabels.get(item.contentType) ?? item.contentType}
        </li>
        {item.categoryIds.map((id) => {
          const name = categoryNames.get(id);
          return name !== undefined ? (
            <li key={id} className={styles.chip}>
              {name}
            </li>
          ) : null;
        })}
        <li className={styles.chip}>{STRINGS.importanceValue(item.importance)}</li>
      </ul>

      {detail.authorNames !== undefined && detail.authorNames.length > 0 && (
        <p className={styles.meta}>{STRINGS.detailAuthors(detail.authorNames.join(', '))}</p>
      )}
      {detail.publicationDate !== undefined && (
        <p className={styles.meta}>{STRINGS.detailPublished(detail.publicationDate)}</p>
      )}

      <p className={styles.description}>{detail.description}</p>

      {detail.image && (
        <figure className={styles.figure}>
          <img className={styles.image} src={detail.image.src} alt={detail.image.alt.he} loading="lazy" />
          {detail.image.credit !== undefined && (
            <figcaption className={styles.credit}>{detail.image.credit}</figcaption>
          )}
        </figure>
      )}

      {detail.video && (
        <figure className={styles.figure}>
          <div className={styles.videoWrapper}>
            <iframe
              className={styles.videoFrame}
              src={`https://www.youtube-nocookie.com/embed/${detail.video.videoId}`}
              title={detail.video.title.he}
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
          {detail.video.credit !== undefined && (
            <figcaption className={styles.credit}>{detail.video.credit}</figcaption>
          )}
        </figure>
      )}

      {item.kind === 'person' && relatedList(STRINGS.detailWorksAbout, detail.workIds ?? [])}
      {item.kind === 'work' && relatedList(STRINGS.detailSubjects, detail.subjectPersonIds ?? [])}
      {item.kind === 'event' && relatedList(STRINGS.detailSubEvents, detail.childEventIds ?? [])}

      {detail.sources.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>{STRINGS.detailSources}</h3>
          <ul className={styles.sourceList}>
            {detail.sources.map((source, i) => (
              <li key={`${source.url}-${i}`}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title.he}
                </a>
                {source.publisher !== undefined && (
                  <span className={styles.sourcePublisher}> — {source.publisher}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
