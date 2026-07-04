/**
 * Interaction & viewport tuning knobs (docs/08-interaction.md). Pure data —
 * gesture handlers and the viewport store read these; nothing here is
 * specific to any content scope.
 */
export const TIMELINE_INTERACTION = {
  /** Max zoom-in: window span never drops below ~one month per screen. */
  minWindowSpanYears: 1 / 12,
  /** Pan bounds extend this fraction of the content extent beyond it. */
  boundsPaddingFraction: 0.02,
  /** The reset ("טווח מלא") view pads the content range by this fraction. */
  resetPaddingFraction: 0.05,
  /** Wheel zoom: factor = exp(deltaY × this); ctrl/pinch-wheel is ~3× stronger. */
  wheelZoomSensitivity: 0.0015,
  pinchWheelZoomSensitivity: 0.0045,
  /** ←/→ pan step as a fraction of the visible span. */
  keyPanFraction: 0.15,
  /** +/− and toolbar-button zoom-in factor (zoom-out uses the inverse). */
  stepZoomFactor: 0.7,
  /** Viewport-cull buffer on each side, in screens (docs/10). */
  bufferScreens: 1,
  /** Relayout after the live window has rested this long (pan settle). */
  settleMs: 120,
  /** Inertial pan: per-frame (16ms) velocity retention and stop threshold. */
  inertiaFriction: 0.92,
  inertiaMinVelocityPxMs: 0.02,
  /** Pointer movement beyond this is a drag, not a click. */
  clickDragThresholdPx: 5,
  /** Zoom applied when expanding a cluster chip beyond its exact span. */
  clusterZoomPaddingFraction: 0.25,
} as const;
