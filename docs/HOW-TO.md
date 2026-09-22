# Inventory Atlas Lite — Quick How-To

A short guide for someone who has already deployed Inventory Atlas Lite and wants to start using it.
Official downloads are on [GitHub Releases](https://github.com/bloschinsky/inventory-atlas-lite/releases).
For installation on Proxmox VE see [`proxmox.md`](proxmox.md); for the technical boundaries of each
feature see [`features/README.md`](features/README.md).

## 1. What Inventory Atlas Lite does

Inventory Atlas Lite is a small self-hosted catalogue of physical things you own: tools, cameras,
lenses, cables, spare parts, boxes in the garage. For every item you record a name, a category, an
optional condition, location, description, purchase details, serial number, your own custom fields,
and photos.

All inventory records and original photo bytes live in one SQLite database on your server. Normal
use needs no external service. The optional **AI Add Item** workflow sends the selected photo at
original image detail, its optional hint, and your category/field schema to OpenAI only after you
press **Analyze**; it therefore needs Internet access.

**There is no authentication.** Anyone who can open the address can read and change the whole
inventory, so keep it on a trusted LAN or behind a VPN.

## 2. Before you start

- Open the address of your installation in a browser, for example `http://192.168.1.145:3000`. A
  Proxmox installation prints this URL at the end; Docker and manual installations use the server
  address and `PORT` (default `3000`).
- Use a current desktop or mobile browser. On a wide screen the four pages and **About** sit in
  a narrow icon sidebar on the left: move the mouse over it — or move the keyboard focus into it
  with `Tab` — and it slides open over the page with the full labels. On a phone or a narrow tablet
  the same list opens from the **☰** button in the top bar.
- The application starts in the light or dark colour scheme your operating system uses. The sun and
  moon buttons switch it and your choice is remembered in the browser for the next visit; on a wide
  screen they appear at the bottom of the sidebar once you expand it, on a narrow screen they are
  always in the top bar.
- Reach the application over your LAN or a VPN such as WireGuard or Tailscale. Do not forward a
  router port to it.
- A fresh installation is empty: no categories and no items. The Dashboard and items page both
  guide you to add the first item. When an item-list search or category filter matches nothing, the
  items page says *No matching items* instead.

## 3. Recommended first setup

1. Open **Categories & Fields** in the navigation and create your first category, for example
   `Cameras`. Type the name into **New category name** and press **Add**.
2. Click the category in the list to select it, then add its custom fields on the right: type a
   **Field name**, choose the type (Text, Number, Date, Boolean), and press **Add**.
3. Go to **Items** and press **Add item**. Fill in **Name** and **Category** — both are required —
   and any other values you want.
4. Select photos at the bottom of the form. They are uploaded when you save the item.
5. Fill in **Location** (free text, such as `Garage`) and, if the item sits inside another item you
   have already recorded, set **Stored inside**.
6. Press **Save item**. You land on the item page; check that it also appears on **Items** and that
   the search finds it by name.
7. Open **Data / Backup** and press **Download backup** to get your first copy of the database.

To use assisted photo entry, open **Settings**, enable AI features, keep **OpenAI** as the provider,
enter an API key, then press **Save settings**. The model selector loads the supported models that
are available to that key; choose one and save the setting. Use **Custom model...** to enter a model
ID that is not yet listed, and use **Refresh models** after access to the OpenAI account changes.
The saved key is shown only as a masked value afterwards.

**Enable AI features** controls whether the AI actions exist in the interface at all. While it is
off, **AI Add Item** and **AI Add Fields** are not shown and `/items/ai` returns you to **Items**;
everything else, including **Batch Add Fields**, works unchanged. The setting takes effect as soon
as you press **Save settings**, with no page reload, and only the saved value counts: ticking the
switch without saving changes nothing elsewhere.

## 4. Core concepts

| Concept | What it means |
| --- | --- |
| **Item** | One physical thing. It always has a name and a category, plus an automatically assigned UUID and created/updated timestamps. Purchase details and a serial number are optional base fields available in every category. |
| **Category** | A group of items, such as `Cameras`. Category names are unique and case-insensitive. |
| **Custom field** | An extra field that belongs to one category. Types: Text, Number, Date, Boolean. Items of that category get the field in their form. |
| **Location** | A free-text note about where the object physically is, such as `Garage` or `Shelf 2`. An item stored inside another item is displayed at the location of its outermost container instead. |
| **Stored inside** | A real link to another item that contains this one, such as a lens inside `Box A`. |
| **Photo** | An image stored inside the database together with the item. |
| **Backup** | A downloadable copy of the whole SQLite database, photos included. |
| **Restore** | Replacing the whole inventory with the contents of such a backup file. |

**Location and Stored inside are different things and work well together.** `Box A` has
`Location = Garage`; the lens inside it has `Stored inside = Box A`, so it is displayed in the
`Garage` too. The box tells you where things are; the nesting tells you what is in what.

**A contained item inherits its displayed location.** While an item is stored inside another one,
every view shows the location of the outermost container of the chain, through as many levels as
there are. The item's own **Location** text is never overwritten: the form still edits it, and it
becomes visible again as soon as the item is taken out of its container. If no container in the
chain has location text, the location is displayed as empty.

A custom field belongs to one category only. `Brand` in `Cameras` and `Brand` in `Lenses` are two
separate fields, and they keep separate value suggestions.

## 5. Basic use cases

### Read and filter the Dashboard

1. Open **Dashboard**, the application's default landing page. Its four summary cards show the
   total item count, the percentage and counts of items with and without photos, physical placement,
   and items added during the rolling last 30 days.
2. Use **Category** to limit those four cards and the **Condition breakdown** to one category. The
   selection is stored in the page URL, so a reload or copied link preserves it. Press **Reset** to
   return to **All categories**.
3. **Items by category** always represents the complete inventory for context. The selected category
   is highlighted; select a visible category bar to apply it as the filter. Only the six largest
   categories are shown separately, with smaller groups combined under **Other**; an actively
   selected smaller category remains visible.
4. **Placement status** counts each item exactly once: first as **Inside a container**, otherwise as
   **Direct location** when it has location text, or as **Unplaced**. It uses each item's own saved
   location, not the inherited one. Containers themselves remain normal inventory items.
5. A category with no items displays a normal zero-data view. If loading fails, press **Retry**.

The database records `created_at` with SQLite `CURRENT_TIMESTAMP`, which is UTC. The Dashboard uses
SQLite's UTC clock and includes records whose timestamp is at or after 30 days before the request.

### Create and rename a category

1. Open **Categories & Fields**.
2. Type a name into **New category name** and press **Add**.
3. To rename, press **Rename** next to the category and enter the new name in the browser prompt.
4. To delete, press **Delete** and confirm. A category that is still used by items cannot be
   deleted — the page reports how many items use it, and you must move or delete them first.

### Add and manage custom fields

1. Open **Categories & Fields** and click a category to select it. The right panel shows
   *Fields for* the selected category.
2. Enter a **Field name**, pick the type, and press **Add**. Field names are unique within a
   category.
3. Press **Delete** next to a field to remove it. The confirmation warns that saved values may also
   be deleted — deleting a field deletes that field's values on every item of the category.

Field types are fixed after creation; to change a type, delete the field and add a new one.

### Add several fields at once

1. Select a category and press **Batch Add Fields** under the field form.
2. Paste a field-definition document. It lists up to 50 fields, each with a `name`, a `type`
   (`text`, `number`, `date`, or `boolean`), and an optional `"required": false`:

   ```json
   {
     "version": 1,
     "fields": [
       { "name": "Brand", "type": "text", "required": false },
       { "name": "Release Year", "type": "number", "required": false }
     ]
   }
   ```

3. Press **Insert Template** under the editor to start from that example instead of typing it.
   An empty editor is filled immediately; if you already wrote something else, the action asks
   before replacing it, and cancelling keeps your text. The action is not available in
   **AI Add Fields**, which uses a description instead of JSON.
4. Press **Preview**. Nothing is saved yet. An unreadable document is reported as a single message;
   a readable one becomes an editable row per field.
5. Review the rows. Each one shows its status — *New*, *Already exists*, *Duplicate in batch*,
   *Invalid type*, or *Invalid configuration* — with the reason. Correct the name or the type in
   place, or press **Remove** to drop that field from the batch. Removing a row changes only this
   draft, never the fields the category already has. **Edit JSON** goes back to the pasted text.
6. Press **Create N Fields** to save them. The button counts the valid new fields and stays disabled
   while any row is still blocked. The whole batch is created at once: if anything fails, no field
   is created. **Cancel** or `Escape` discards the draft.

Required custom fields do not exist yet, so `"required": true` is rejected instead of being ignored.

### Let AI suggest the fields for a category

1. Configure and enable OpenAI under **Settings → AI**, the same setup **AI Add Item** uses. The
   button appears only while AI features are enabled.
2. Select a category and press **AI Add Fields** under the field form.
3. Describe the category and the fields you need, for example *Suggest useful fields for a category
   containing vintage computer expansion cards such as graphics cards, sound cards, network cards
   and controllers*, then press **Generate Fields**.
4. The suggestion arrives in the same review as a pasted document, with the same per-row statuses.
   Rename a field, change its type, or press **Remove** to drop it. Nothing is saved yet.
   **Edit Description** goes back to your text so you can generate again.
5. Press **Create N Fields** to save the fields you approved. **Cancel** or `Escape` discards
   everything.

Only the four supported types can be suggested, and the category name, its existing field names, and
the built-in item attributes are sent with your description so the model avoids duplicates. The
usual review still blocks a name that already exists. If the request fails or the answer is
unusable, the message explains why and your description stays in the modal for a retry.

### Create an item

1. Open **Items** and press **Add item**. If no category exists yet, the form tells you to create one
   first and links to **Manage categories**.
2. Fill in **Name** and choose a **Category**. Both are required.
3. Optionally fill in **Condition**, **Location**, **Purchase Date**, **Purchase Price**, **Serial
   Number**, **Stored inside**, and **Description**. Purchase Price has separate amount and currency
   controls; clear the amount to leave the whole price unspecified.
4. Values for the category's custom fields appear under **Category fields**. Text fields suggest
   values you have already used (see below), boolean fields are a Yes/No list, number and date fields
   use the matching browser control.
5. Add photos, then press **Save item**.

Changing the category while filling in the form loads that category's fields.

### Create an item from a photo with AI

1. Configure and enable OpenAI under **Settings → AI**. The default model is `gpt-5.6-luna`; you can
   replace it with another OpenAI model that accepts image input and strict structured output.
2. Open **Items** and press **AI Add Item** next to **Add item**. The button appears only while AI
   features are enabled.
3. Select one JPEG, PNG, WebP, or GIF photo of at most 15 MB. Optionally describe what you know in
   **Additional description**; visible evidence in the photo takes priority. Enable **Remove
   background** if you want a locally processed final photo with the item centered on white. The
   option is off by default.
4. Press **Analyze** once. The button shows progress and cannot submit a duplicate request. If the
   request fails, the selected photo and description stay on the page so you can retry.
5. The normal item form opens with the suggested existing category, supported base and custom-field
   values, confidence, any warnings, and a preview of the photo ready to upload. When background
   removal succeeds, this is a JPEG with a white background; otherwise the original is retained and
   a warning explains the fallback. Choose another photo in the normal file control at any time.
   Empty values remain empty. Review and edit every value; AI suggestions are not guaranteed to be
   correct.
6. Press **Save item** to create the record through the normal workflow. Leaving or reloading the
   review page before saving discards the temporary draft, and no inventory record has been written.

The analysis always uses one original-detail OpenAI request so visible brand, family, model, part,
and serial markings remain readable. Background removal runs independently on the local CPU with
U2NetP and never sends an additional provider request or consumes tokens. It does not search the
web, create categories or fields, or make a second AI request.

### Edit or delete an item

1. Open the item from **Items** and press **Edit**.
2. Change what you need and press **Save item**.
3. To delete, press **Delete** on the item page and confirm. The item and its photos are removed.
4. An item that still contains other items cannot be deleted. The message reports how many items are
   inside; move or delete them first.

### Add, view, and remove photos

1. Photos are added through the item form, at the bottom, under **Photos**. Select one or several
   files and save.
2. Up to **10 images per upload, 15 MB each**. Supported formats are JPEG, PNG, WebP, and GIF; other
   files are rejected by the server.
3. The item page shows one large photo at a time. With several photos it becomes a carousel: the
   arrows over the left and right edge of the image move one photo, the small bars at the bottom of
   the image jump straight to a photo, and a `1 / 3` counter below shows where you are. You can also
   swipe on a touch screen or drag with the mouse. Nothing changes on its own. The first photo is
   used as the thumbnail in the items list.
4. Delete a photo with **Delete photo** under it on the item page, or with the **×** button on its
   thumbnail in the edit form. Both act immediately and are separate from deleting the item.

### Search, filter, sort, and page through items

1. Open **Items**.
2. Type into **Search**. The search runs as you type and matches the item name, description, and
   serial number — not custom field values, condition, or location.
3. Narrow the list with **Category** (**All categories** by default).
4. **Sort by** Name, Category, Created, or Updated, with **Direction** Ascending or Descending.
5. On a wide screen the results are a table with photo, name, category, condition, location,
   **Stored inside**, and **View** / **Edit** buttons; the container name links to its own page. On a
   narrower window the location and the container move under the item name, and on a phone each item
   is a card with the same information and the same two buttons. The location shown is the inherited
   one for items that sit inside a container.
6. The list shows 12 items per page; use **Previous** and **Next** below the results. The total count
   is shown under the **Items** heading.

### Put an item inside another item

1. Open the item's form (**Add item** or **Edit**).
2. In **Stored inside**, type part of the container's name into
   *Search an item to store this one in…* and press **Search** or Enter.
3. Click the result you want. It appears as a badge above the search box.
4. Press **Clear** next to the badge to take the item out of its container and make it top-level
   again.
5. Save. The item page now shows a **Storage** card with **Stored inside** linking to the container,
   and the container's page lists the item under **Contents**. **Location** on the item page now
   shows the container's location with a short note that it is inherited.

Nesting can go several levels deep. An item cannot be placed inside itself or inside anything it
already contains; the server rejects such a move with an error message.

### Use custom-field autocomplete

1. In the item form, click into any **Text** custom field.
2. Values already saved for that exact field appear, most used first.
3. Keep typing to filter them; matching is case-insensitive and matches from the start of the value.
4. Choose one with the mouse, or with `ArrowDown`/`ArrowUp` and `Enter`. `Escape` closes the list and
   `Tab` leaves the field without choosing anything.
5. You can always type a completely new value. Once saved, it is suggested the next time.

### Switch between light and dark mode

1. Press the sun button for light mode or the moon button for dark mode. On phones and narrow
   tablets they are always in the top bar; on a wide screen expand the sidebar first (hover it or
   move keyboard focus into it) to reach them at its bottom.
2. The choice applies immediately, on every page, and is stored in this browser only. It changes
   nothing on the server, so each browser and device can use a different mode.
3. Until you press one of them, the application follows your operating system's colour scheme.

### Download a backup

1. Open **Data / Backup**.
2. Press **Download backup**. The browser saves a file named `inventory-YYYY-MM-DD.sqlite`.

### Restore a backup

Restoring **replaces the whole inventory**. Everything added or changed after the selected backup
was created disappears from the active database. It is not a merge or an import.

1. Open **Data / Backup** and find **Restore from backup**.
2. Press **Choose File** and select a backup downloaded from this application
   (`.sqlite`, `.sqlite3`, or `.db`). The selected name and size are shown; the contents are checked,
   not the file name.
3. Press **Validate backup**. The file is uploaded and checked on the server. Nothing has changed yet.
4. Read the **Validation result**: the file name and size, the compatibility line, and how many
   categories, items, custom fields, values, and photos the backup contains. If these numbers do not
   match the backup you expect, stop here and select another file.
5. Read the red warning. Before the replacement the application writes a **pre-restore safety
   backup** of the current database on the server, and during the final swap it refuses changes for
   a few seconds.
6. Type `RESTORE` in the confirmation field. The **Restore backup** button stays disabled until the
   word matches.
7. Press **Restore backup** and wait. When the application is ready again it reports
   `Backup restored successfully`, names the safety backup file that holds your previous data, and
   opens the items list with the restored inventory.

If the file is not a valid, compatible Inventory Atlas Lite backup, validation fails with a short
explanation and the current data is left untouched. A validated file is kept on the server for ten
minutes; after that, validate it again. Only one restore runs at a time, and a backup download
cannot overlap the final swap.

### Check which version you are running

1. Press **About** at the bottom of the navigation list — in the sidebar on a wide screen, in the
   **☰** menu on a phone.
2. The dialog shows the product name, the **Version**, the **Build** (the short Git commit the
   application was built from), the **Build date** (the date of that commit), the developer, and a
   link to the GitHub repository.
3. Close it with the **Close** button, the **×**, `Escape`, or a click outside it.

Quote **Version** and **Build** when you report a problem: together they identify the exact source
revision. A version ending in `-dev` means the application was built from a working copy rather
than from a release tag. A **Build** or **Build date** of `unavailable` means the build had no Git
information — the published release archive has none — and says nothing about the health of your
installation.

### See what changed between releases

1. Open **About** and press **Version History**.
2. A larger dialog lists the releases, newest first, with their date and the changes you can notice
   in the application. The release you are running is marked **Installed**.
3. Scroll the list for older releases. Close it with **Close**, the **×**, `Escape`, or a click
   outside it; the About dialog stays open behind it.

The history is part of the application, so it works without an internet connection. It lists the
releases known when your installation was built; newer ones appear after you update.

### Check for a newer version and update

1. Open **About** and press **Check for updates**. The application asks the server, which compares
   the running version with the latest stable release on GitHub. Nothing is downloaded yet.
2. When you already run the newest release, it says *Inventory Atlas Lite is up to date.*
3. When a newer release exists, it shows its version. What happens next depends on how this
   installation was set up:
   - **Proxmox/LXC installation**: press **Update to `<version>`**. A confirmation shows
     `current → new` and reminds you that a database backup is created automatically and that the
     application is briefly unavailable. Press **Update** to start, or **Cancel** to do nothing.
   - **Docker, a manual Node.js installation, or development**: the application cannot update itself.
     It says so and offers **View release**, which opens the release page on GitHub. Update the
     container or the installation the way you normally deploy it.
4. During an update the panel reports each step: preparing, downloading, creating a database backup,
   installing, restarting, and verifying. The application restarts while this runs, so short
   connection failures are expected; the page waits for it to come back.
5. When the new version is running, the panel reports *Update completed successfully.* and reloads
   the page. You may close the dialog while the update runs — it keeps going, and reopening **About**
   shows the same progress.
6. If the new version does not start correctly, the updater puts the previous version and the
   pre-update database back and the panel reports *Update failed.* with the restored version. The
   inventory is preserved. The technical details are in the container log
   (`journalctl -u inventory-atlas-lite-update`).

Only published stable releases are ever installed, and only from the official repository. Updating
from the container shell with `inventory-atlas-lite-update` still works exactly as before.

## 6. Practical example

```text
Garage
└── Box A
    ├── Helios 44-2 lens
    └── Olympus camera
```

`Garage` is not a record — it is plain text.

1. Create the categories you need, for example `Boxes`, `Lenses`, and `Cameras`.
2. Create the item `Box A` in `Boxes` with **Location** = `Garage`.
3. Create `Helios 44-2` in `Lenses` and set **Stored inside** = `Box A`.
4. Create `Olympus Pen F` in `Cameras` and set **Stored inside** = `Box A`.
5. Open `Box A`: both items are listed under **Contents** in its **Storage** card, each linking to
   its own page.
6. Open `Helios 44-2`: **Stored inside** links back to `Box A`.
7. When the box moves to the attic, change **Location** on `Box A` only. Its contents immediately
   display the attic as well, because a contained item is shown at the location of its container.

## 7. Backup and data safety

**Data / Backup → Download backup** writes a consistent snapshot of the database using SQLite's
backup API, so it is safe to download while the application is running. The file contains everything:
items, categories, custom fields, values, nesting, and the original photo bytes. There are no
separate image files to back up.

Where the live database sits depends on the installation:

| Installation | Database |
| --- | --- |
| Manual / development | `data/inventory.sqlite` under the project directory, or `DATA_DIR` when set |
| Docker | `/data/inventory.sqlite` on the mounted named volume or bind mount |
| Proxmox LXC installer | `/var/lib/inventory-atlas-lite/inventory.sqlite` |

The **Data / Backup** page mentions `data/inventory.sqlite`, which is the default path; Docker and
Proxmox installations use the paths above. Always recreate a Docker container with the same `/data`
mount. A container started without that mount has a separate empty database.

A Proxmox `vzdump` backup protects the whole container and its configuration. The downloaded SQLite
snapshot is portable: it is what you need to move the inventory to another machine or installation.
The Proxmox updater also writes such a snapshot before every update, keeping the last five in
`/var/lib/inventory-atlas-lite/backups`. See [`proxmox.md`](proxmox.md).

**Data / Backup → Restore from backup** puts such a snapshot back. The upload is validated before
anything changes, the current database is copied to `pre-restore-backups/` next to the live database
first, and a failure during the replacement rolls that copy back automatically. The ten most recent
pre-restore copies are kept; older ones are removed after a successful restore, and a failed cleanup
never deletes user data. Operators can also copy one of these files back manually while the
application is stopped. `RESTORE_MAX_UPLOAD_MB` limits the size of an uploaded backup; the default is
512 MB, and a larger file is refused. Never copy a live database file while the application is
writing to it — download a backup instead.

For a personal homelab, download a backup after every larger cataloguing session, and keep the copies
on a different machine than the server.

## 8. Limitations and security

- **No authentication, no user accounts, no permissions.** Everyone who reaches the address has full
  access.
- Not intended for direct exposure to the Internet. Use a trusted LAN or a VPN; do not forward a
  router port and do not put it behind a public reverse proxy.
- Photos: JPEG, PNG, WebP, GIF, up to 10 files of 15 MB each per upload.
- Search covers the item name, description, and serial number.
- A category used by any item cannot be deleted, and an item containing other items cannot be
  deleted.
- Deleting a custom field also deletes the values saved for it on every item of that category.
- Custom field types cannot be changed after creation, and categories cannot be merged. The batch
  editor only creates new fields; it never renames or retypes existing ones.
- Restore replaces the whole inventory from a full SQLite backup. There is no merge, no selective
  restore of single items or categories, no CSV or JSON import or export, and no label printing.
- Anyone who reaches the unauthenticated interface can restore a backup and therefore replace all
  current data. Keep the application on a trusted LAN or VPN.
- AI Add Fields sends your description, the category name, its field names, and the built-in
  attribute names to OpenAI. It only proposes fields; the fields are created by the same reviewed
  batch as a pasted document, and a failed request changes nothing.
- AI Add Item uses OpenAI and sends the selected image at original detail, the optional hint, and
  category/field definitions outside the local deployment. The original image is stored only after
  you confirm the draft. The OpenAI key stays in `ai-settings.json` under `DATA_DIR` and is not part
  of SQLite backups, so move or reconfigure it separately.
- Autocomplete is offered for text custom fields only, not for the name, condition, location, or
  description.
- Updating from **About** is available on the Proxmox/LXC installation only. Docker, manual, and
  development installations can check for a newer release but must be updated where they are
  deployed. Only published stable releases are offered, always from the official repository, and the
  application never gains any other privilege on the machine.
- Anyone who reaches the unauthenticated interface can start such an update. Keep the application on
  a trusted LAN or VPN.

## 9. Quick troubleshooting

| Symptom | What to check |
| --- | --- |
| The page does not open | Confirm the address and port, and that you are on the same LAN or VPN. On Proxmox, check that the container runs with `pct status <CTID>`. |
| The page opens but shows errors | The API may be down. On Proxmox: `systemctl status inventory-atlas-lite` inside the container. `GET /api/health` answers `{"status":"ok",…}` when the server and the database are fine. |
| A category cannot be deleted | Items still use it. The message says how many; move them to another category or delete them. |
| An item cannot be deleted | It still contains other items. Open it, move or delete everything under **Contents**, then delete it. |
| A photo is rejected | Only JPEG, PNG, WebP, and GIF are accepted, at most 10 files of 15 MB each per upload. |
| Search finds nothing | The search matches the name, description, and serial number. Clear the category filter and check that you are on page 1. |
| No suggestions in a text field | Suggestions come from values already saved for that same field. A newly created field starts empty. |
| AI Add Item is missing | AI features are off. Open **Settings**, tick **Enable AI features**, enter an OpenAI API key and an image-capable model, then save. The AI actions appear immediately. |
| AI Add Fields suggests nothing usable | The message reports an empty or malformed answer. Describe the category in more detail and press **Generate Fields** again; your description is kept. |
| AI analysis fails | Read the message for an invalid key, rate limit, unavailable provider, timeout, unsupported image, or missing category. The selected photo and hint remain available for retry. |
| Which version is this | Open **About** in the navigation. It shows the version, the commit the build came from, and its date. **Version History** in the same dialog lists what changed in each release. |
| Where are the logs | On Proxmox, inside the container: `journalctl -u inventory-atlas-lite -f`. See [`proxmox.md`](proxmox.md) for the other service commands. |
