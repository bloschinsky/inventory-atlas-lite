# Inventory Atlas Lite — Quick How-To

A short guide for someone who has already deployed Inventory Atlas Lite and wants to start using it.
Official downloads are on [GitHub Releases](https://github.com/bloschinsky/inventory-atlas-lite/releases).
For installation on Proxmox VE see [`proxmox.md`](proxmox.md); for the technical boundaries of each
feature see [`features/README.md`](features/README.md).

## 1. What Inventory Atlas Lite does

Inventory Atlas Lite is a small self-hosted catalogue of physical things you own: tools, cameras,
lenses, cables, spare parts, boxes in the garage. For every item you record a name, a category, an
optional condition, location and description, your own custom fields, and photos.

Everything lives in one SQLite database on your server, including the original photo bytes. Nothing
is sent anywhere else and the application needs no Internet connection at runtime.

**There is no authentication.** Anyone who can open the address can read and change the whole
inventory, so keep it on a trusted LAN or behind a VPN.

## 2. Before you start

- Open the address of your installation in a browser, for example `http://192.168.1.145:3000`. A
  Proxmox installation prints this URL at the end; Docker and manual installations use the server
  address and `PORT` (default `3000`).
- Use a current desktop or mobile browser. On a wide screen the three pages and **About** sit in
  a narrow icon sidebar on the left: move the mouse over it — or move the keyboard focus into it
  with `Tab` — and it slides open over the page with the full labels. On a phone or a narrow tablet
  the same list opens from the **☰** button in the top bar.
- The application starts in the light or dark colour scheme your operating system uses. The sun and
  moon buttons switch it and your choice is remembered in the browser for the next visit; on a wide
  screen they appear at the bottom of the sidebar once you expand it, on a narrow screen they are
  always in the top bar.
- Reach the application over your LAN or a VPN such as WireGuard or Tailscale. Do not forward a
  router port to it.
- A fresh installation is empty: no categories and no items. The items page shows *No items yet*
  with an **Add your first item** button. When a search or a category filter matches nothing, the
  page says *No matching items* instead.

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

## 4. Core concepts

| Concept | What it means |
| --- | --- |
| **Item** | One physical thing. It always has a name and a category, plus an automatically assigned UUID and created/updated timestamps. |
| **Category** | A group of items, such as `Cameras`. Category names are unique and case-insensitive. |
| **Custom field** | An extra field that belongs to one category. Types: Text, Number, Date, Boolean. Items of that category get the field in their form. |
| **Location** | A free-text note about where the object physically is, such as `Garage` or `Shelf 2`. It is not linked to anything. |
| **Stored inside** | A real link to another item that contains this one, such as a lens inside `Box A`. |
| **Photo** | An image stored inside the database together with the item. |
| **Backup** | A downloadable copy of the whole SQLite database, photos included. |

**Location and Stored inside are different things and work well together.** `Box A` has
`Location = Garage`; the lens inside it has `Stored inside = Box A` and usually no location of its
own. The box tells you where things are; the nesting tells you what is in what.

A custom field belongs to one category only. `Brand` in `Cameras` and `Brand` in `Lenses` are two
separate fields, and they keep separate value suggestions.

## 5. Basic use cases

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

### Create an item

1. Open **Items** and press **Add item**. If no category exists yet, the form tells you to create one
   first and links to **Manage categories**.
2. Fill in **Name** and choose a **Category**. Both are required.
3. Optionally fill in **Condition**, **Location**, **Stored inside**, and **Description**.
4. Values for the category's custom fields appear under **Category fields**. Text fields suggest
   values you have already used (see below), boolean fields are a Yes/No list, number and date fields
   use the matching browser control.
5. Add photos, then press **Save item**.

Changing the category while filling in the form loads that category's fields.

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
3. The item page shows one large photo at a time. With several photos, **Previous** and **Next**
   below it move through them and a `1 / 3` indicator shows where you are. The first photo is used as
   the thumbnail in the items list.
4. Delete a photo with **Delete photo** under it on the item page, or with the **×** button on its
   thumbnail in the edit form. Both act immediately and are separate from deleting the item.

### Search, filter, sort, and page through items

1. Open **Items**.
2. Type into **Search**. The search runs as you type and matches the item name and description
   only — not custom field values, condition, or location.
3. Narrow the list with **Category** (**All categories** by default).
4. **Sort by** Name, Category, Created, or Updated, with **Direction** Ascending or Descending.
5. On a wide screen the results are a table with photo, name, category, condition, location,
   **Stored inside**, and **View** / **Edit** buttons; the container name links to its own page. On a
   narrower window the location and the container move under the item name, and on a phone each item
   is a card with the same information and the same two buttons.
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
   and the container's page lists the item under **Contents**.

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
7. When the box moves to the attic, change **Location** on `Box A` only. Its contents follow it
   automatically because they have no location of their own.

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

**There is no restore button.** Restoring a snapshot is a manual server-side operation: stop the
application, put the file in place of the live `inventory.sqlite` (removing any `-wal` and `-shm`
files next to it), and start the application again. Never copy a live database file while the
application is writing to it — download a backup instead.

For a personal homelab, download a backup after every larger cataloguing session, and keep the copies
on a different machine than the server.

## 8. Limitations and security

- **No authentication, no user accounts, no permissions.** Everyone who reaches the address has full
  access.
- Not intended for direct exposure to the Internet. Use a trusted LAN or a VPN; do not forward a
  router port and do not put it behind a public reverse proxy.
- Photos: JPEG, PNG, WebP, GIF, up to 10 files of 15 MB each per upload.
- Search covers the item name and description only.
- A category used by any item cannot be deleted, and an item containing other items cannot be
  deleted.
- Deleting a custom field also deletes the values saved for it on every item of that category.
- Custom field types cannot be changed after creation, and categories cannot be merged.
- There is no restore, import, or export function in the interface beyond the SQLite backup
  download, and no CSV or label printing.
- Autocomplete is offered for text custom fields only, not for the name, condition, location, or
  description.

## 9. Quick troubleshooting

| Symptom | What to check |
| --- | --- |
| The page does not open | Confirm the address and port, and that you are on the same LAN or VPN. On Proxmox, check that the container runs with `pct status <CTID>`. |
| The page opens but shows errors | The API may be down. On Proxmox: `systemctl status inventory-atlas-lite` inside the container. `GET /api/health` answers `{"status":"ok",…}` when the server and the database are fine. |
| A category cannot be deleted | Items still use it. The message says how many; move them to another category or delete them. |
| An item cannot be deleted | It still contains other items. Open it, move or delete everything under **Contents**, then delete it. |
| A photo is rejected | Only JPEG, PNG, WebP, and GIF are accepted, at most 10 files of 15 MB each per upload. |
| Search finds nothing | The search matches only the name and description. Clear the category filter and check that you are on page 1. |
| No suggestions in a text field | Suggestions come from values already saved for that same field. A newly created field starts empty. |
| Which version is this | Open **About** in the navigation. It shows the version, the commit the build came from, and its date. |
| Where are the logs | On Proxmox, inside the container: `journalctl -u inventory-atlas-lite -f`. See [`proxmox.md`](proxmox.md) for the other service commands. |
