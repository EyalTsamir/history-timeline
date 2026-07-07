# Importance scoring — calibration protocol

`importance` (integer 1–100) is the single number that decides how loudly an item renders at
each zoom altitude (docs/spec/zoom.md). It never decides *whether* an item shows — presence
is guaranteed; low scores render as dots. So score for **historical weight relative to the
existing corpus**, never for visibility.

## The rubric (docs/spec/zoom.md)

| Range | Meaning | Existing examples |
|---|---|---|
| 90–100 | Era-defining; carries the century view | הכרזת העצמאות 100, מלחמת העצמאות 95, מלחמת ששת הימים 92, השואה 88* |
| 70–89 | Major national events | הסכם אוסלו 82, השלום עם מצרים 80, מלחמת לבנון הראשונה 78, מבצע קדש 72, המרד הערבי 70 |
| 40–69 | Notable events, sub-events of the top tier | המהפך 68, חוק השבות 65, תוכנית הייצוב 62, מבצע יונתן 60, הכנסת הראשונה 50, משטר הצנע 46 |
| 20–39 | Contextual detail (decade/year altitude) | ואדי סאליב 38, גוש אמונים 34, ועדת אגרנט 32, עליית הנוער 28, אירוויזיון 1978 24 |
| 1–19 | Fine detail (year altitude only) | ביטול הלביא 19, ייבוש החולה 18, הסכם ההעברה 17, אילת 15, אסון גשר המכביה 15 |

\* rubric examples are events; people and works use the same bands (most works sit 20–39 by
design — decision in zoom.md — with only canonical works reaching ~44–50).

## Protocol (apply per topic, mechanically)

1. **Neighbors first.** From the inventory (`scripts/list-events.mjs` output), pull 5–8
   existing entries that are the closest comparisons: same category, similar kind (war /
   law / founding / disaster / cultural moment), similar era. Write them down with scores.
2. **Pick the band** from the rubric by asking what altitude should *name* this item:
   era-defining (≥90) is essentially closed for this corpus — new additions are almost never
   there; "major national" (70–89) means a typical museum wall would label it a defining
   national event **and** obliges an image (corpus convention); most new additions land in
   40–69 or 20–39; use 1–19 deliberately for fine texture, it is a thin but real band.
3. **Slot between neighbors.** The number must read correctly as a comparison: if it scores
   above X it claims to matter more than X. Check the claim against 2–3 specific neighbors.
4. **Structural constraints:** a sub-event scores strictly below its parent (validator warns →
   tests fail). Within a batch, rank sibling topics against each other *before* fixing
   numbers, so the batch doesn't land on one plateau value.
5. **Record a one-line rationale** naming the anchors, e.g. "52 — above הכנסת הראשונה (50)
   as the founding act of the party that governed for ~47 years; below חוק השבות (65)".

## Worked example — הקמת מפא״י (January 1930)

- Neighbors: המהפך 68 (end of Mapai-era rule), חוק השבות 65, הכנסת הראשונה 50,
  לוי אשכול לרה״מ 30, הקמת גוש אמונים 34, הקמת שלום עכשיו 24.
- Band: the founding of the party that dominated the Yishuv and the state for ~47 years is a
  "notable event" with major long-run consequences — not itself an era-defining moment like
  the events it enabled. Band 40–69.
- Slot: clearly above party/movement foundings like גוש אמונים (34); at least as significant
  as כינון הכנסת הראשונה (50); below חוק השבות (65) and המהפך (68).
- → **importance ≈ 50–55** (e.g. 52), rationale recorded. No image obligation (<70), though a
  verified PD photo of the founding conference would be acceptable.

## Batch anti-drift rules

- Do the band assignment for the **whole batch in the pre-pass**, then refine numbers as
  dossiers come back; never score topic #14 without its batch siblings on screen.
- Distributions matter: the corpus is a pyramid (~6 items ≥90, ~21 at 70–89, ~66 at 40–69,
  ~47 at 20–39, ~8 at 1–19 across all entity types). A 20-topic batch that lands 15 items in
  70–89 is mis-calibrated — most curated additions belong at 20–69.
- If two batch topics feel equal, make them equal — then check both against the same existing
  neighbor rather than nudging one up "for variety".
