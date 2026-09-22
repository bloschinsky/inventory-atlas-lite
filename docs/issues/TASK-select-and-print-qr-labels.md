# Task: Select Items and Print QR Labels

## Goal
Add batch selection of items and an A4 print workflow for QR labels.

Each label uses the canonical UUID-based Inventory Atlas QR payload and optional item metadata.

## Dependency
Blocked by **Item QR Identity and QR Code Generation**.

Independent of the scanner task.

## Item selection
Add selection checkboxes to Items:
- desktop table;
- mobile cards.

Show:
- selected count;
- **Print Labels** action;
- disable Print Labels when none selected.

Keep View/Edit behavior unchanged.

Prefer preserving selection across pagination. If not practical, explicitly scope it and never silently lose selections.

## Print view
Add a dedicated route/view, e.g.:

```text
/labels/print
```

Pass selected item UUIDs, not full item objects in the URL.

Load metadata needed for labels efficiently.

If some selected items no longer exist, skip them with a visible warning.

## Controls
Show:
- selected count;
- layout preset;
- metadata toggles;
- A4 preview;
- page count;
- Print.

Metadata:
- QR Code — required;
- Item name — default ON;
- Description — default ON;
- Category — default OFF;
- Location — default OFF.

Use effective/displayed location.

## QR
Every label must encode:

```text
ial:item:v1:<uuid>
```

Reuse shared QR utilities/rendering.

Never encode deployment URL.

## Layout presets
Provide fixed presets:

```text
Large
Standard
Compact
```

Use physical CSS units (`mm`) and A4 print CSS.

Requirements:
- Large: fewer, larger labels;
- Standard: default balanced layout;
- Compact: approximately up to 30 labels/A4 where practical;
- more selected items create more pages;
- never limit selection to one page.

## Text behavior
- no overflow outside labels;
- wrap/clamp long names;
- clamp/truncate description/location;
- QR keeps a reliably scannable minimum size;
- metadata yields space before QR does.

## Printing
Use:

```js
window.print()
```

with `@media print`.

Do not implement server-side PDF generation.

Browser print dialog can handle physical print or Save as PDF.

## Print CSS
When printing:
- hide sidebar/navigation/controls/buttons;
- print only label sheets;
- use A4 size and deterministic page breaks;
- never split one label across pages;
- force white background / black foreground regardless of app theme.

## Data loading
Avoid N+1 item detail requests for large selections.

If needed, add a narrow batch endpoint such as:

```text
POST /api/items/labels
```

with UUIDs in JSON.

Return only fields needed for labels, e.g.:
- uuid;
- name;
- description;
- category;
- effective location.

Follow current service/repository architecture.

## Optional single-item integration
If low-cost, add **Print Label** to the single-item QR modal and route it through the same print renderer. Do not duplicate rendering code.

## Limits
A generous print-job limit may be added to avoid browser lockups.
- show a clear error;
- never silently truncate;
- do not restrict to one A4 page.

## Tests
Cover at minimum:
1. desktop selection;
2. mobile selection;
3. selected count;
4. disabled Print Labels at zero selection;
5. selected items reach preview;
6. each label uses correct UUID QR;
7. default metadata options;
8. toggles update preview;
9. Large/Standard/Compact change layout;
10. multi-page output;
11. labels do not split across pages;
12. long text does not overflow;
13. dark mode does not affect printed label colors;
14. app chrome hidden in print mode;
15. deleted/missing selected items handled;
16. no N+1 detail request pattern;
17. existing Items filtering/sorting/pagination/View/Edit still work.

Mock `window.print()` where needed.

## Documentation
Document selection, presets, metadata options, multi-page A4 printing, Save as PDF, and deployment-independent QR payloads.

## Out of scope
- drag-and-drop label designer;
- arbitrary fonts/colors;
- custom dimension editor;
- stored label templates;
- server-side PDF generation;
- direct printer drivers;
- non-QR barcodes;
- check-in/check-out workflows.
