# Interaction & responsive design

The whole UI is Hebrew, `dir="rtl"` on the root, CSS logical properties
throughout. The time axis also runs right-to-left (decision D5): panning
**leftward moves forward in time**.

## Layout

```
Desktop (≥ 900px)                              Mobile (< 900px)
┌──────────────────────────────┬─────────┐    ┌─────────────────────┐
│ header: title + filters      │         │    │ header + filter btn │
│ results line (count · clear) │ detail  │    │ results line        │
│ century strip (eras + brush) │ panel   │    │ century strip       │
│ event field (canvas)         │ (opens  │    ├─────────────────────┤
│ cast strip · period shelf    │ on      │    │ chronicle feed:     │
│ time ruler + altitude ctrls  │ select) │    │   era → year → items│
└──────────────────────────────┴─────────┘    │   (scroll = time)   │
                                               └─────────────────────┘
                                                detail  = bottom sheet
                                                filters = slide-over sheet
```

One responsive breakpoint (~900px) switches both the detail surface (side panel
↔ bottom sheet) and the primary view (event-field canvas ↔ vertical chronicle),
and the filter surface (inline bar ↔ sheet).

## Gestures & controls (desktop canvas)

Zoom is **altitude stepping** ([zoom](zoom.md)): wheel/pinch deltas accumulate
to a threshold, then step century↔decade↔year anchored at the pointer; panning
stays continuous. As implemented (`components/Timeline.tsx`; knobs in
`timeline/config.ts`):

| Action | Desktop | Mobile |
|---|---|---|
| Pan through time | drag (inertial); horizontal wheel/trackpad (deltaX); ←/→ keys | one-finger horizontal drag, inertial |
| Zoom (step altitude) | vertical wheel (cursor-anchored, accumulates then steps); ctrl/⌘+wheel = stronger; +/− keys; +/− buttons; double-click empty canvas dives one level | two-finger pinch (midpoint-anchored, accumulates then steps); +/− buttons |
| Jump to an altitude | century/decade/year segmented control (centered) | segmented control |
| Select item | click; Tab/Enter (items are real focusable buttons) | tap |
| Reset view | "טווח מלא" button; Home key (→ century) | "טווח מלא" button |
| Close detail | Esc / close button | close button, Esc, backdrop tap |

Interaction rules that matter:

- **Zoom anchors under the pointer / pinch midpoint** — the moment under your finger stays put (`zoomWindowAtPx`, unit-tested). Keyboard/button zoom anchors at the viewport center.
- **Accumulate-then-step**: wheel/pinch deltas sum until a threshold so a trackpad flick is one altitude step, not five; the accumulator resets after ~400ms idle (a fresh gesture intent).
- **Grab semantics for panning**: the time under the pointer follows the pointer, so under the RTL axis dragging leftward reveals earlier times, and ←/→ move the view toward the side the arrow points at — spatially consistent in both axis directions.
- During a pan the item/ruler layers move by CSS transform only; layout recomputes on settle, on crossing the one-screen cull buffer, or rAF-throttled during an altitude change. Inertia via decayed velocity; `prefers-reduced-motion` disables inertia.
- Pointer capture is taken only once a drag passes the slop threshold (capturing on pointerdown would retarget the click away from the pressed item); the click after a real drag/pinch is suppressed, and the suppress flag is cleared at the start of each fresh single-pointer gesture so the *next* tap is never swallowed.
- Zoom bounds (decision D12): zoom-in stops at the year altitude (and a minimum window-span clamp); zoom-out at the full data extent (+2% pad), which is also the pan clamp — a hard clamp, no elastic edges. Reset = configured content range +5% margins. All derived from data + config at load; nothing hardcodes 1930–2000.
- **Touch coexistence**: the surface sets `touch-action: pan-y`, so vertical swipes stay with the browser (page scroll) and horizontal swipes/pinches belong to the timeline. Row budgets bound the canvas height, so no inner vertical scrolling is needed.
- Nothing depends on hover; every gesture has a button/keyboard equivalent.

## Mobile: the chronicle

Below the 900px breakpoint the canvas is replaced by a **vertical feed**
(`components/Chronicle.tsx`) — scroll *is* movement through time:

- Sections per era → year headings → items sorted by time.
- Card size follows tier ([zoom](zoom.md)): seal/anchor → large card with description; chapter → card listing children (expand in place); major/minor → compact row; background → pill row. Cast and shelf appear as cards per era section.
- No pinch, no horizontal gestures. The century strip on top shows position (scroll spy via IntersectionObserver) and jumps on tap.
- Viewport sync: the active year updates `viewportStore` (a coarse window), so shared URLs work in both directions across form factors.

## Selection & detail

Selecting an item opens the detail surface without moving the timeline: title ·
precision-aware date ("מאי 1948", "1936–1939", "≈1942"; an open lifespan shows
"1954– (נמשך עד היום)", never a fabricated end) · description/bio · image with
credit · content-type and category chips · importance · sources ("מקורות") ·
external links · and the one relationship traversal the MVP exposes — for a
person: books about them; for a work: its subjects and author; for an event: its
sub-events. Each related item is a button that selects it and pans it into view
(events only; people/works open from the strips).

Surfaces (`TimelineWorkspace`): **desktop** — an inline side panel at the
timeline's inline-end; selecting moves focus into the panel (skipped for a
URL-restored selection on load), Esc or ✕ closes and returns focus to the item's
button (or the timeline surface if it was culled off-screen). **Mobile** — the
shared `Sheet` component in its bottom-sheet variant: modal, focus-trapped,
scroll-locked (ref-counted across sheets), Esc/backdrop/✕ close. Focus
restoration on mobile has a **single owner** — the Sheet restores to the opener
or a fallback; `closeDetail` does not also restore, so the two never fight.

## Accessibility

- Items are DOM buttons (a core reason for decision D6): focusable, Hebrew `aria-label` ("אירוע: מלחמת העצמאות, 1947–1949"), `aria-current` on the selected item, Tab order = chronological.
- The timeline region is a labeled, focusable `role="application"` zone whose keyboard controls are documented in an `aria-describedby` text (arrows/±/Home); zoom, altitude, and reset are labeled controls, so pan/zoom never requires a gesture.
- The visible-range readout is an `aria-live` text near the controls — the current period is always stated, not only drawn. The filter result count ("מוצגים … מתוך …") is likewise in an `aria-live` `role="status"` region, so filter changes are announced.
- Color is never the only signal — weight comes from marker shape and size per importance tier; AA contrast on text tokens; `prefers-reduced-motion` disables inertia.
- Viewport culling means off-screen items are not in the DOM — keyboard users move through time with the arrow keys (which load items) rather than by Tabbing past the viewport (accepted behavior; if a selected item is culled off-screen, focus falls back to the timeline surface).
- MVP requires JavaScript; a crawlable static list view is a [roadmap](../roadmap.md) item.
