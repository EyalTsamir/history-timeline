import styles from './Spinner.module.css';

/** Animated ring is decoration (aria-hidden); the visible label carries meaning. */
export function Spinner({ label }: { label: string }) {
  return (
    <div className={styles.wrap} role="status">
      <span className={styles.ring} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
