# TASK: Hierarchy — Add Category Grouping Mode

**Status:** Planned
**Priority:** High
**Type:** Feature enhancement / alternative hierarchy projection
**Blocked by:**
- Hierarchy Phase 1 — Storage Tree
- Hierarchy Phase 2 — Graph View
- Hierarchy Location Grouping task / canonical `Inventory → Location → ...` hierarchy

**Must remain compatible with:** `TASK-HIERARCHY-PHASE-3-DRAG-DROP.md`

---

## Goal

Extend the existing **Hierarchy** section with a second way to organize the same inventory data.

The current/default hierarchy answers:

> **Where is this item and what is stored inside what?**

Add a new Category grouping mode that answers:

> **What items of each type/category do I own?**

The page must expose two independent controls:

```text
Group by
[ Location ] [ Category ]

View
[ Tree ] [ Graph ]
```

This creates four supported combinations:

```text
Location + Tree
Location + Graph
Category + Tree
Category + Graph
```

`Location` remains the default grouping mode.

Do not replace or weaken the existing Location hierarchy.

---

## 1. Two different hierarchy semantics

The application must treat the two grouping modes as different projections of the same item data.

### Location mode

Canonical physical/storage hierarchy:

```text
Inventory
→ Location
→ top-level containers / Uncontained items
→ nested contents
```

`parent_item_id` is the main structural relationship.

This mode answers:

```text
Where is it?
What contains it?
What is inside this container?
```

### Category mode

Classification hierarchy:

```text
Inventory
→ Category
→ items
→ same-category nested items
```

`category_id` is the main grouping relationship.

`parent_item_id` is used only when the direct parent belongs to the same category.

This mode answers:

```text
What items do I own in this category?
Which same-category items/components are structurally nested?
```

---

## 2. Category nodes

Every real category becomes one virtual hierarchy node under `Inventory`.

Example:

```text
Inventory
├─ Photography
├─ Computer Equipment
├─ Gaming
├─ Literature
└─ Containers
```

Category nodes must use stable category identity, preferably:

```text
category:<category_id>
```

Do not use the visible category name as the only identity.

Category nodes are not items and must be visually distinguishable from real item nodes.

---

## 3. Category counts

Each Category node must show the total number of real items assigned to that category.

Example:

```text
Photography           34
Computer Equipment    78
Gaming                41
Containers            19
```

Counts include all items in the category regardless of physical Location or cross-category container.

Do not count virtual nodes.

---

## 4. Same-category containment rule

Preserve direct containment hierarchy inside Category mode **only when both parent and child belong to the same category**.

Rule:

```text
if item.parent_id exists
AND parent.category_id === item.category_id

    render item under parent

else

    render item as a direct child/root item of its Category
```

Example:

```text
Photography
├─ Nikon F65
│  └─ Nikon 50mm f/1.8
├─ Nikon F80
└─ Metz Flash
```

where:

```text
Nikon F65.category_id == Photography
Nikon 50mm.category_id == Photography
Nikon 50mm.parent_item_id == Nikon F65.id
```

This same-category relation must work at arbitrary depth.

---

## 5. Computer/component example

The same rule must support composition-style inventory structures.

Example:

```text
Computer Equipment
│
├─ Main PC
│  ├─ ASUS Motherboard
│  │  └─ Ryzen 7 3700X
│  ├─ RTX 3060
│  ├─ Sound Blaster
│  ├─ Samsung SSD
│  └─ Corsair PSU
│
├─ ThinkPad T14s
└─ Mac Pro 5,1
```

No special PC/component schema is required.

Use the existing category and parent relationships only.

---

## 6. Cross-category containment

Do NOT copy a parent from another category into the current Category tree.

Example physical hierarchy:

```text
Box A                  [Containers]
└─ Nikon F65           [Photography]
   └─ Nikon 50mm       [Photography]
```

Location mode:

```text
Home
└─ Box A
   └─ Nikon F65
      └─ Nikon 50mm
```

Category mode:

```text
Photography
└─ Nikon F65
   └─ Nikon 50mm

Containers
└─ Box A
```

`Box A` must NOT appear inside Photography.

`Nikon F65` becomes a Category-root item because its direct parent belongs to another category.

---

## 7. No item duplication

A real item must appear exactly once in Category mode.

Do not render the same item once under its Category and again under its physical container.

Example that must NOT happen:

```text
Photography
└─ Nikon F65

Containers
└─ Box A
   └─ Nikon F65
```

Inside Category mode, `Nikon F65` appears only under `Photography`.

Its physical placement is shown as metadata, not by duplicating the node.

---

## 8. Direct-parent rule only

Do not invent same-category relations by skipping intermediate parents of another category.

Example physical hierarchy:

```text
Camera                 [Photography]
└─ Camera Bag          [Containers]
   └─ Lens             [Photography]
```

Category mode must render:

```text
Photography
├─ Camera
└─ Lens

Containers
└─ Camera Bag
```

Do NOT infer:

```text
Photography
└─ Camera
   └─ Lens
```

because `Lens.parent_item_id` points to `Camera Bag`, not to `Camera`.

Only direct persisted parent relationships may create nesting.

---

## 9. Physical placement metadata in Category mode

Category mode must preserve useful physical/storage context without changing the hierarchy.

Each item node should be able to show compact secondary metadata such as:

```text
Nikon F65
KP Garage · Stored inside: Box A
```

or equivalent compact UI.

Prefer using data already available from the hierarchy endpoint.

At minimum show when practical:

- `effective_location`;
- direct physical parent name when the parent exists and is not represented as the same-category visual parent.

If the hierarchy API does not currently expose the direct parent name, extend the lightweight response carefully rather than performing request-per-item lookups.

Do not fetch full Item Details per node.

---

## 10. Category-mode child counts

Do not use the global physical `children_count` as the expandable Category-tree count when some children belong to different categories.

Example:

```text
Nikon F65
├─ Nikon 50mm       [Photography]
├─ Film Roll        [Photography]
└─ Battery          [Accessories]
```

In Category mode:

```text
Photography
└─ Nikon F65
   ├─ Nikon 50mm
   └─ Film Roll
```

The Category-mode expandable count is:

```text
2
```

not:

```text
3
```

Calculate Category-view child counts from the Category projection.

Do not mislead the UI by showing physical-child counts as Category-child counts.

Optional total physical contents may be shown separately only if clearly labelled.

---

## 11. Shared projection architecture

Do not hardcode Category grouping independently inside Tree and Graph components.

Refactor hierarchy transformation into explicit projection/building layers.

Suggested conceptual structure:

```text
buildLocationHierarchy(items)
buildCategoryHierarchy(items)
```

Both should produce one normalized renderer-facing row/node format.

For example:

```text
{
  key,
  type,
  parent,
  depth,
  item,
  childCount,
  expanded
}
```

Exact implementation is up to the agent.

The important rule is:

> Tree and Graph render normalized hierarchy output and do not independently implement Location or Category business rules.

Prefer shared helpers for:

- virtual node identity;
- ancestor lookup;
- search;
- expand/collapse;
- visible rows;
- item lookup.

---

## 12. Group-by control

Add a separate grouping control to the Hierarchy page.

Required UI concept:

```text
Group by
[ Location ] [ Category ]

View
[ Tree ] [ Graph ]
```

Do not merge grouping and rendering mode into one four-option selector.

`Location` and `Category` describe **what hierarchy means**.

`Tree` and `Graph` describe **how that hierarchy is visualized**.

---

## 13. URL state

Persist both choices in the route/query so browser navigation behaves predictably.

Suggested examples:

```text
/hierarchy
```

Default:

```text
group=location
view=tree
```

Category Tree:

```text
/hierarchy?group=category
```

Category Graph:

```text
/hierarchy?group=category&view=graph
```

Exact query format may follow existing conventions.

Requirements:

- Location remains default;
- Back from Item Details returns to the same grouping/view when possible;
- invalid query values fall back safely.

---

## 14. Category Tree

Category Tree should support the same practical interactions as Location Tree:

- expand/collapse Category;
- expand/collapse same-category item branches;
- Expand all;
- Collapse all;
- item thumbnails/icons;
- item links to Item Details;
- counts;
- search;
- mobile layout.

Example:

```text
⌄ Photography                         34
  ⌄ Nikon F65
      Nikon 50mm
      Kodak Gold 200
    Nikon F80
    Canon EOS 300

› Computer Equipment                  78
› Gaming                              41
```

Do not add `Uncontained items` inside Category mode.

Items that have no valid same-category parent simply appear directly under the Category.

---

## 15. Category Graph

Category Graph must visualize:

```text
Inventory
→ Category
→ Category-root items
→ same-category descendants
```

Example:

```text
            Inventory
                |
         Photography
          /        \
     Nikon F65    Canon EOS
         |
     Nikon 50mm
```

and:

```text
        Computer Equipment
               |
            Main PC
        /       |       \
 Motherboard   GPU      PSU
      |
     CPU
```

Requirements:

- reuse current Graph renderer where possible;
- deterministic layout;
- pan/zoom/fit behavior remains;
- collapse/expand works;
- visible-node safety limit remains;
- search highlighting remains;
- no WebGL/3D;
- no graph database.

---

## 16. Search

Search must work in both grouping modes.

### Location mode

Keep existing behavior.

### Category mode

Search must match at least:

- item names;
- Category names.

Searching an item should reveal:

```text
Category
→ same-category ancestor path
→ matching item
```

Searching a Category should reveal that Category branch.

Cross-category physical parents are metadata only and should not be inserted into the Category search path.

Switching `Group by` while a search is active must produce a correct result for the selected projection.

---

## 17. Expansion state

Location and Category projections represent different hierarchies.

Do not assume one expansion key set is automatically valid for both.

Prefer separate expansion state per grouping mode:

```text
locationExpansion
categoryExpansion
```

Switching:

```text
Location → Category → Location
```

should ideally restore the previous expansion state for each mode while the page remains open.

Tree and Graph of the **same grouping mode** should continue sharing compatible expansion state.

---

## 18. Backend/API

Prefer reusing:

```text
GET /api/items/hierarchy
```

because it already returns much of the required data:

- item id;
- name;
- parent relationship;
- category id;
- category name;
- thumbnail;
- effective location;
- physical child count.

Only extend the payload if Category node metadata requires data that cannot be derived efficiently on the client, such as direct parent display name.

Do not create a separate `/categories/hierarchy` endpoint unless there is a strong documented reason.

Avoid:

- N+1 requests;
- one request per Category;
- one request per item;
- loading full photos or Item Details.

No database migration is expected.

---

## 19. Read-only Category mode

This task does NOT add editing semantics to Category mode.

Category mode is a browsing/visualization projection.

Do not implement:

- drag item to another Category to recategorize;
- drag item under another item to reparent;
- graph edge editing;
- inline category assignment.

Existing Item edit workflows remain authoritative.

---

## 20. Phase 3 Drag & Drop compatibility

`TASK-HIERARCHY-PHASE-3-DRAG-DROP.md` must be reviewed after this feature is implemented.

If necessary, update that task so it explicitly states:

- structural drag/drop belongs to the Location/storage projection;
- Category mode remains read-only during Phase 3 unless a separate future task explicitly defines category-editing semantics;
- do not interpret dragging onto a Category node as `parent_item_id`;
- do not silently implement category reassignment via hierarchy drag/drop;
- Tree/Graph Category projection must refresh correctly after structural changes performed in Location mode.

If the Phase 3 task already says this after previous specification updates, no redundant rewrite is required, but verify consistency.

---

## 21. Tests

Add/update automated coverage for at least:

1. every Category becomes one virtual Category node;
2. Category node count equals number of items assigned to that Category;
3. item with no parent appears directly under Category;
4. item with same-category direct parent appears under that parent;
5. same-category nesting works at multiple depths;
6. item with cross-category parent becomes a Category-root item;
7. cross-category parent is not inserted into the wrong Category;
8. direct-parent rule does not skip intermediate cross-category nodes;
9. every item appears exactly once in Category mode;
10. Category child count uses same-category visible children;
11. physical `children_count` does not incorrectly drive Category expansion count;
12. effective Location metadata remains available;
13. direct physical parent metadata is correct where shown;
14. Category Tree expand/collapse works;
15. Category Graph edges reflect Category projection;
16. Category Graph layout remains deterministic;
17. Category search works;
18. item search reveals same-category ancestor path;
19. Location grouping remains unchanged;
20. switching Location ↔ Category works;
21. Tree ↔ Graph works within Category grouping;
22. grouping/view route state survives navigation/back;
23. separate expansion state does not leak incorrectly between grouping modes;
24. graph visible-node safety limit still works;
25. no writes occur from Category browsing;
26. existing nested-item and effective-location tests continue to pass.

Add E2E coverage for at least:

- switching to Category Tree;
- expanding a Category;
- expanding one same-category nested item;
- opening Item Details and navigating back;
- switching to Category Graph;
- searching for an item;
- switching back to Location and confirming the physical hierarchy remains unchanged.

---

## 22. Documentation

Update:

```text
docs/features/hierarchy.md
```

Document the two independent concepts:

```text
Group by:
- Location
- Category

View:
- Tree
- Graph
```

Document Category rules:

- Category is the primary grouping;
- only direct same-category containment is preserved;
- cross-category containment is metadata only;
- items are never duplicated;
- Category mode is read-only;
- Location mode remains the physical/storage hierarchy.

Add completed change note:

```text
docs/changes/<date>-hierarchy-category-grouping.md
```

Update screenshots/examples if the project documentation includes them.

---

## 23. Acceptance Criteria

The task is complete only when all of the following are true:

1. Hierarchy exposes separate `Group by` and `View` controls.
2. `Location` remains the default grouping.
3. `Category` grouping is available in both Tree and Graph.
4. Category nodes use real category identity and show item counts.
5. Each real item appears exactly once in Category mode.
6. Direct same-category parent/child relations preserve nesting.
7. Cross-category parents do not appear inside the wrong Category.
8. The implementation never skips an intermediate cross-category parent to invent a relation.
9. Category-mode child counts reflect same-category hierarchy.
10. Physical placement remains available as metadata without controlling Category grouping.
11. Tree and Graph consume one normalized Category projection.
12. Search works with Category names and item names.
13. Location hierarchy behavior is unchanged.
14. Category mode is read-only.
15. No schema migration or graph database is introduced.
16. Route/back behavior preserves grouping and view.
17. Existing graph performance protections remain.
18. Phase 3 drag/drop specification is verified/updated so Category mode is not given ambiguous mutation semantics.
19. Tests, E2E, docs, and lint pass.

---

## Out of Scope

Do not add in this task:

- Category drag/drop editing;
- drag-to-recategorize;
- multiple categories per item;
- tags;
- arbitrary graph relations;
- inferred non-direct parent relationships;
- cross-category item duplication;
- `part of` / `installed in` / `stored in` relation types;
- Category-specific graph edge types;
- cross-category storage-link overlays;
- graph database;
- 3D visualization.

A future task may add optional secondary storage-link overlays or richer relation types if they are later justified.
