/**
 * Accessible modal drawer (mobile filter surface, docs/08-interaction.md).
 * Focus moves in on open and is contained while open: Escape/Tab are handled
 * at document level (so they keep working when focus lands on non-interactive
 * content), a focusin listener recaptures focus that escapes the panel, and
 * page scroll is locked. On close, focus returns to the opener — or to a
 * fallback (`fallbackFocusRef`) when the opener is gone or hidden.
 */
import { useEffect, useId, useRef } from 'react';
import type { MouseEvent, ReactNode, RefObject } from 'react';
import { Button } from './Button';
import styles from './Sheet.module.css';

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Ref-counted page-scroll lock shared across Sheet instances, so overlapping
// sheets (or an out-of-order close) can never unlock the page while one is still
// open. The original overflow is captured once, restored only when the last
// sheet closes.
let scrollLockCount = 0;
let scrollLockPrevOverflow = '';
function acquireScrollLock(): void {
  if (scrollLockCount === 0) {
    scrollLockPrevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
  }
  scrollLockCount += 1;
}
function releaseScrollLock(): void {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) document.documentElement.style.overflow = scrollLockPrevOverflow;
}

interface SheetProps {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  /** Focused on close when the opener is unmounted or display:none. */
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  /**
   * 'end' — slide-over drawer at the inline-end edge (filters, the default);
   * 'bottom' — bottom sheet (mobile item detail, docs/08). Same focus/scroll
   * behavior, different geometry.
   */
  side?: 'end' | 'bottom';
  children: ReactNode;
}

export function Sheet({ open, title, closeLabel, onClose, fallbackFocusRef, side = 'end', children }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    closeRef.current?.focus();

    const focusables = (): HTMLElement[] => {
      const panel = panelRef.current;
      if (!panel) return [];
      return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled'),
      );
    };

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      const first = els[0];
      const last = els[els.length - 1];
      if (!first || !last) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const active = document.activeElement;
      // Wrap at the edges; if focus is on the panel itself, body, or anything
      // outside the panel (click on non-interactive content), pull it back in.
      const inside = active instanceof HTMLElement && els.includes(active);
      if (!inside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Belt-and-braces: any focus landing outside the panel comes back in.
    const onFocusIn = (e: globalThis.FocusEvent) => {
      const panel = panelRef.current;
      if (!panel || !(e.target instanceof Node) || panel.contains(e.target)) return;
      (focusables()[0] ?? panel).focus();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    acquireScrollLock();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      releaseScrollLock();
      if (opener instanceof HTMLElement) opener.focus();
      // A hidden/unmounted opener silently refuses focus — verify it landed.
      // Reading `.current` at cleanup time is intentional: we want the LIVE
      // fallback (the timeline surface, which may have re-rendered), not a stale
      // snapshot from effect setup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (document.activeElement !== opener) fallbackFocusRef?.current?.focus();
    };
  }, [open, fallbackFocusRef]);

  if (!open) return null;

  const onBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className={side === 'bottom' ? `${styles.overlay} ${styles.overlayBottom}` : styles.overlay}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={side === 'bottom' ? `${styles.panel} ${styles.panelBottom}` : styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.panelHeader}>
          <h2 id={titleId} className={styles.panelTitle}>
            {title}
          </h2>
          <Button
            ref={closeRef}
            aria-label={closeLabel}
            className={styles.closeButton}
            onClick={onClose}
          >
            <span aria-hidden="true">✕</span>
          </Button>
        </div>
        <div className={styles.panelBody}>{children}</div>
      </div>
    </div>
  );
}
