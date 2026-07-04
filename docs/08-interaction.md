# 08 — Interaction & responsive design

The whole UI is Hebrew, `dir="rtl"` on the root, CSS logical properties throughout. The time axis also runs right-to-left (decision D5): panning **leftward moves forward in time**.

## Layout

```
Desktop (≥ 900px)                        Mobile (< 900px)
┌──────────────────────────┬─────────┐   ┌─────────────────────┐
│ header: title + filters  │         │   │ header + filter btn │
├──────────────────────────┤ detail  │   ├─────────────────────┤
│ events band              │ panel   │   │ events band         │
│ people band              │ (opens  │   │ people band         │
│ works band               │ on      │   │ works band          │
├──────────────────────────┤ select) │   ├─────────────────────┤
│ time ruler + zoom ctrls  │         │   │ time ruler          │
└──────────────────────────┴─────────┘   └─────────────────────┘
                                          detail = bottom sheet
                                          filters = slide-over sheet
```

One responsive breakpoint (~900px) switches the detail surface (side panel ↔ bottom sheet) and the filter surface (inline bar ↔ sheet). Everything else adapts continuously — semantic zoom already normalizes density per pixel ([05](05-semantic-zoom.md)), so narrow screens automatically show fewer items rather than smaller ones.

## Gestures & controls

As implemented (`components/Timeline.tsx`; all knobs in `timeline/config.ts`):

| Action | Desktop | Mobile |
|---|---|---|
| Pan through time | drag (inertial); horizontal trackpad scroll (deltaX); ←/→ keys (≈15% of the span) | one-finger horizontal drag, inertial |
| Zoom | vertical wheel (cursor-anchored); ctrl/⌘+wheel = trackpad pinch (stronger); +/− keys; +/− buttons; double-click empty canvas | two-finger pinch (midpoint-anchored); +/− buttons |
| Select item | click; Tab/Enter (items are real focusable buttons) | tap |
| Expand cluster chip "+5 נוספים" | click (zooms to fit its contents) | tap |
| Reset view | "טווח מלא" button; Home key | "טווח מלא" button |
| Close detail | Esc / close button | close button, Esc, backdrop tap |

Interaction rules that matter:

- **Zoom anchors under the pointer/pinch midpoint** — the moment under your finger stays put (`zoomWindowAtPx`, unit-tested). Keyboard/button zoom anchors at the viewport center.
- **Grab semantics for panning**: the time under the pointer follows the pointer, so under the RTL axis dragging leftward reveals earlier times (they enter from the right, where the past lives) and ←/→ move the view toward the side the arrow points at — spatially consistent in both axis directions.
- During a pan the item/ruler layers move by CSS transform only; layout recomputes on settle (~120ms), on crossing the one-screen cull buffer, or rAF-throttled during zoom. Inertia via decayed velocity; `prefers-reduced-motion` disables inertia and the fade transition.
- Pointer capture is taken only once a drag passes the 5px slop (capturing on pointerdown would retarget the click away from the pressed item); clicks after a real drag are suppressed.
- Zoom bounds (decision D12): max in = 1 month per screen; max out = the full data extent (+2% pad), which is also the pan clamp — a hard clamp, no elastic edges (accepted simplification). Reset = configured content range +5% margins. All derived from data + config at load; nothing hardcodes 1930–2000.
- **Touch coexistence**: the surface sets `touch-action: pan-y`, so vertical swipes stay with the browser (page scroll) and horizontal swipes/pinches belong to the timeline; the browser cancels our pointers when it claims a vertical scroll. Band row budgets bound the timeline's height, so no inner vertical scrolling is needed.
- Nothing depends on hover; every gesture has a button/keyboard equivalent.

## Selection & detail

Selecting an item opens the detail surface without moving the timeline:
title · precision-aware date ("מאי 1948", "1936–1939", "≈1942"; an open lifespan shows "1954– (נמשך עד היום)", never a fabricated end) · description/bio · image with credit · content-type and category chips · importance indicator · external links · for a person: books about them (reverse index); for a work: its subjects and author; for an event: its sub-events — each related item is a button that selects it and pans it into view, zooming out only if it doesn't fit (the one relationship traversal the MVP exposes).

Surfaces (`TimelineWorkspace`): **desktop** — an inline side panel at the timeline's inline-end; selecting moves focus into the panel (skipped for a URL-restored selection on load), Esc or ✕ closes and returns focus to the item's button. **Mobile** — the shared `Sheet` component in its bottom-sheet variant: modal, focus-trapped, scroll-locked, Esc/backdrop/✕ close, focus restored to the tapped item.

## Accessibility

- Items are DOM buttons (a core reason for decision D6): focusable, Hebrew `aria-label` ("אירוע: מלחמת העצמאות, 30 בנובמבר 1947 – 20 ביולי 1949"), `aria-current` on the selected item, Tab order = chronological within band.
- The timeline region is a labeled, focusable `role="application"` zone whose keyboard controls are documented in an `aria-describedby` text (arrows/±/Home); zoom buttons and the reset button are labeled controls, so pan/zoom never requires a gesture.
- The visible-range readout is plain text near the controls — the current period is always stated, not only drawn.
- Color is never the only kind-signal (filled bar / diamond / line / outlined chip per kind); AA contrast on text tokens; `prefers-reduced-motion` disables inertia and fades.
- Viewport culling means off-screen items are not in the DOM — keyboard users move through time with the arrow keys (which loads items) rather than by Tabbing past the viewport (accepted behavior).
- A `<noscript>`/failure fallback renders nothing fancy — MVP accepts JS requirement; a static list view is a roadmap item ([11](11-roadmap.md)).
