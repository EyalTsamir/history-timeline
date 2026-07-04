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

| Action | Desktop | Mobile |
|---|---|---|
| Pan through time | drag; horizontal trackpad scroll; ←/→ keys | one-finger horizontal drag, inertial |
| Zoom | wheel (cursor-anchored); +/− keys; zoom slider | pinch (midpoint-anchored) |
| Select item | click; Tab/Enter (items are real focusable buttons) | tap |
| Expand cluster chip "+5 נוספים" | click (zooms to fit its contents) | tap |
| Reset view | "טווח מלא" button | same |

Interaction rules that matter:

- **Zoom anchors under the pointer/pinch midpoint** — the moment under your finger stays put. This is the single most important feel-decision in a zoomable timeline.
- During a gesture, the item layer moves by CSS transform only; visibility/layout recompute on rAF-throttled scale settle. Inertia via decayed velocity; `prefers-reduced-motion` disables inertia and fades.
- Zoom bounds: max out ≈ full 1930–2000 range +10% margins; max in ≈ 1 month per screen. Pan clamps to content bounds with elastic edges.
- Vertical scrolling inside bands only when a band's rows overflow its height (mobile); vertical swipe is otherwise ignored so the page never fights the browser.

## Selection & detail

Selecting an item opens the detail surface without moving the timeline:
title · precision-aware date ("מאי 1948", "1936–1939", "≈1942") · description/bio · image with credit · content-type and category chips · importance indicator · external links · for a person: their books (reverse index); for a work: its subjects and author — each a link that selects that item and pans it into view (the one relationship traversal the MVP does expose).

## Accessibility

- Items are DOM buttons (a core reason for decision D6): focusable, Hebrew `aria-label` ("אירוע: מלחמת העצמאות, 1947 עד 1949"), Tab order = chronological within band.
- The timeline region is a labeled `role="application"` zone with documented keyboard controls; filters and panels are standard accessible components (sheets trap focus, Esc closes).
- Color is never the only kind-signal (shape + icon differ per band/type); AA contrast on text tokens.
- A `<noscript>`/failure fallback renders nothing fancy — MVP accepts JS requirement; a static list view is a roadmap item ([11](11-roadmap.md)).
