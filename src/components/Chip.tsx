import type { ReactNode } from 'react';
import styles from './Chip.module.css';

interface ChipProps {
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Taxonomy color token — rendered as a small dot accent when present. */
  dotToken?: string | undefined;
}

/** Toggle chip: a real button with aria-pressed, so state is programmatic, not visual-only. */
export function Chip({ pressed, onToggle, children, dotToken }: ChipProps) {
  return (
    <button type="button" className={styles.chip} aria-pressed={pressed} onClick={onToggle}>
      {dotToken !== undefined && (
        <span
          className={styles.dot}
          aria-hidden="true"
          style={{ background: `var(--cat-${dotToken})` }}
        />
      )}
      {children}
    </button>
  );
}
