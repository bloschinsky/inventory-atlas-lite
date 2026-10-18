# Specific location

## Summary

Every item has an optional plain-text **Specific location** (Ukrainian *Точне місце*) beside its broad
**Location**: the exact spot within that place, such as `Bedroom, wardrobe, top shelf` within
`Apartment`. It is stored as `items.location_detail` and follows the same outermost-container
inheritance as the location, so an item inside a container is shown at the container's broad and
specific location. **Stored inside** keeps its meaning: it is the link to a physical container, not a
place. There are no Room or Shelf entities and no location taxonomy.

## User-visible behaviour

- **Item form** (Add, Edit, Duplicate, template editor, through `ItemDraftFields.vue`): an optional
  **Specific location** input next to **Location**, with the placeholder `Bedroom, wardrobe, top
  shelf`, the hint *Optional: the exact spot within the location.*, and a 255-character limit. While
  **Stored inside** is set, one note under both fields says the displayed values are inherited and the
  fields keep the item's own saved values.
- **Item details**: a **Specific location** row directly below **Location** shows the effective
  value (`—` when there is none) and, for a contained item, *Displayed specific location is inherited
  from the parent container.* The Retirement card shows the last location with its specific location.
- **Items list**: while the **Specific location** column is hidden (the default), the table shows the
  effective specific location in small secondary text under the Location cell and the phone card
  joins it to the Location line (`Apartment · Bedroom, wardrobe`). The **Specific location** core
  column in **Columns** replaces that secondary text, so the value is never shown twice; it sorts
  case-insensitively with empty values last, like the other text columns.
- **Search**: the Items search also matches the effective specific location, whatever columns are
  visible, so searching `Kitchen` finds a box placed in the kitchen and everything inside it. The own
  saved value of a contained item, which is not where it is shown, never matches. The broad location
  is still not searched.
- **Taking an item out of its container** (*Where is this item now?* in `ItemForm.vue`) offers the
  placements as pairs: where it was (the container's location and specific location), its own saved
  pair (when it differs, compared without case and surrounding spaces), **Another location**, or
  **No location**. The choice fills both fields, and saving needs a choice, so an outdated saved
  specific location never silently becomes authoritative.
- **History**: a change of the effective location *or* specific location is one **Location changed**
  event per item, shown as `Apartment · Bedroom → Apartment · Living room`, under the **Locations**
  filter. Changing both fields in one save is one event in one operation; the contents of a moved
  container get theirs in the same operation with *Moved together with …*. Retirement and restoration
  events show the specific location with the location.
- **Restore to inventory**: the *On its own, at a location* choice also has a **Specific location**
  input, prefilled with the saved value.
- **Hierarchy**: grouping by broad effective location is unchanged; the specific location appears only
  in an item's secondary line, in both the Tree and the Graph. No virtual nodes are created from it.
- **Labels, checklists**: the Location line of a printed label, the checklist entries, and the
  checklist item picker show the effective specific location after the location.
- **Templates, Duplicate, Batch Add Items**: templates store a Specific location default that an item
  draft carries, Duplicate copies the item's own value, and the batch JSON document accepts an optional
  `"locationDetail"` (version 1 stays valid without it), reviewed inline with the item rules.
- **Demo**: the Tool Cabinet and the Archive Box of the public demo have a specific location in both
  languages.

## Implementation overview

- **Schema (version 12)**: `items.location_detail`, `items.retired_location_detail_snapshot` (with
  the other lifecycle columns), `item_templates.location_detail`, and `item_events.from_detail` and
  `to_detail` are nullable `TEXT` columns added by idempotent `ALTER TABLE ... ADD COLUMN` migrations
  in `applySchema()`, so a live database, a restore candidate, a reset, and the demo's sql.js database
  are upgraded alike. Existing rows read as unset, and no history is written for them.
- **Validation**: `validateLocationDetail()` in `shared/itemValidation.js` trims the text, stores
  blank as `null`, and refuses a non-string (`INVALID_LOCATION_DETAIL`) or more than 255 characters
  (`LOCATION_DETAIL_TOO_LONG`). `readItemDetails(body, current)` keeps the saved value of an update
  that omits `location_detail`, so an older client never clears it; `null` or `""` clears it.
- **Inheritance**: the effective value comes from the same root as `effective_location` — the
  outermost container, not the nearest one with a value. `ItemRepository.findRoot()`, the list
  (`search()`), `listHierarchy()`, `findLabels()`, and the checklist entries select the root's
  `location_detail` in the statements they already run (`ROOTS_CTE`), so there is no query per item.
  `ItemService` returns `effective_location_detail` next to `effective_location`;
  `effective_location_source` names the root for both.
- **List**: the `locationDetail` core column (`shared/itemColumns.js`) sorts by the effective value.
  A search adds the effective value to the matched columns; only a search makes the count statement
  join the roots as well, so an unfiltered count stays as cheap as before.
- **History**: `ItemHistoryRepository.snapshot()` reads the root's `location_detail`, and
  `detectChanges()` records `location_changed` when either effective value changed (by
  `historyKey()`, ignoring case and surrounding spaces), carrying `from_detail` and `to_detail`.
  `trackLifecycle()` stores the detail beside the retirement and restoration location.
- **Lifecycle**: `ItemRepository.retire()` snapshots the effective specific location into
  `retired_location_detail_snapshot` (returned as `retirement.last_location_detail`), and `restore()`
  writes an optional `location_detail` to the restored root only.
- **Client**: `placementText()` in `client/src/itemColumns.js` joins a location and a specific
  location with ` · `; `ItemDraftFields.vue`, `ItemForm.vue`, `ItemDetails.vue`, `ItemResults.vue`,
  `ItemHistoryTimeline.vue`, `RestoreItemDialog.vue`, `BatchAddItemsDialog.vue`, `PrintLabels.vue`,
  `ChecklistItemPicker.vue`, `ChecklistDetails.vue`, and `hierarchyTree.js` use it or the field.

## Verification

- `test/location-detail.test.js` covers the version 12 migration of a version 11 database and of a
  restored version 11 backup, validation and limits, the omitted-attribute rule for items and
  templates, inheritance at depth with a root that has no value, a container move that writes nothing
  to its contents, the list, hierarchy, and labels, sorting and searching (including the hidden own
  value), history grouping, retirement snapshots and restore, templates, batch import, and the HTTP
  contract.
- `test/e2e/location-detail.spec.js` covers the form, item details and the inherited note, the list's
  secondary text, search, and column, the detach choice, the history of a contained item after its
  container moved, Ukrainian, and the phone card.

## Notes and limitations

- The specific location is free text. It is not suggested, grouped, or charted, and the Dashboard
  location chart and the Hierarchy groups use the broad location only.
- **Bulk Replace Field Value** does not offer the specific location.
- A history event recorded before version 12 has no specific location, and a retirement made before
  it has no specific location snapshot.
