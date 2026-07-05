/**
 * Interaction & viewport tuning knobs (docs/08 pan mechanics, docs/14 §3
 * altitude stepping). Pure data — gesture handlers and the viewport store
 * read these; nothing here is specific to any content scope.
 */
export const TIMELINE_INTERACTION = {
  /** Max zoom-in guard: window span never drops below ~one month per screen. */
  minWindowSpanYears: 1 / 12,
  /** Pan bounds extend this fraction of the content extent beyond it. */
  boundsPaddingFraction: 0.02,
  /** The reset ("טווח מלא") view pads the content range by this fraction. */
  resetPaddingFraction: 0.05,
  /** Accumulated wheel deltaY (px) that triggers one altitude step. */
  wheelStepPx: 110,
  /** ctrl/meta-wheel (trackpad pinch) accumulates faster — smaller threshold. */
  ctrlWheelStepPx: 60,
  /** Two-pointer pinch: cumulative distance ratio that triggers one step. */
  pinchStepRatio: 1.3,
  /** ←/→ pan step as a fraction of the visible span. */
  keyPanFraction: 0.15,
  /** Viewport-cull buffer on each side, in screens (docs/10). */
  bufferScreens: 1,
  /** Relayout after the live window has rested this long (pan settle). */
  settleMs: 120,
  /** Inertial pan: per-frame (16ms) velocity retention and stop threshold. */
  inertiaFriction: 0.92,
  inertiaMinVelocityPxMs: 0.02,
  /** Pointer movement beyond this is a drag, not a click. */
  clickDragThresholdPx: 5,
} as const;
