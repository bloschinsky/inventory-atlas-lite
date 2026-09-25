# Inventory Atlas Lite — Quick How-To

A short guide for someone who has already deployed Inventory Atlas Lite and wants to start using it.
Official downloads are on [GitHub Releases](https://github.com/bloschinsky/inventory-atlas-lite/releases).
For installation on Proxmox VE see [`proxmox.md`](proxmox.md); for the technical boundaries of each
feature see [`features/README.md`](features/README.md).

## 1. What Inventory Atlas Lite does

Inventory Atlas Lite is a small self-hosted catalogue of physical things you own: tools, cameras,
lenses, cables, spare parts, boxes in the garage. For every item you record a name, a category, an
optional condition, location, description, purchase details, serial number, where the item was
transferred to, your own custom fields, and photos.

All inventory records and original photo bytes live in one SQLite database on your server. Normal
use needs no external service. The optional AI features send the selected photo, your written
description, and your category/field schema to the AI provider you configure — OpenAI, OpenRouter, a
local Ollama or LM Studio server, or another OpenAI-compatible endpoint — only when you ask for a
draft. A hosted provider needs Internet access; a local model server on your network does not.

**There is no authentication.** Anyone who can open the address can read and change the whole
inventory, so keep it on a trusted LAN or behind a VPN.

## 2. Before you start

- Open the address of your installation in a browser, for example `http://192.168.1.145:3000`. A
  Proxmox installation prints this URL at the end; Docker and manual installations use the server
  address and `PORT` (default `3000`).
- Use a current desktop or mobile browser. On a wide screen the pages and **About** sit in
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

To use the interface in Ukrainian, first choose **Українська** under **Settings → Interface →
Language**; see [Change the interface language](#change-the-interface-language). The steps below use
the English names.

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

To use the AI features, open **Settings** and set up the **AI** card:

1. Choose a **Provider**. Each one fills in its default **Base URL**:

   | Provider | Default base URL | API key |
   | --- | --- | --- |
   | OpenAI | `https://api.openai.com/v1` | required |
   | OpenRouter | `https://openrouter.ai/api/v1` | required |
   | Ollama | `http://localhost:11434/v1` | not needed |
   | LM Studio | `http://localhost:1234/v1` | only if you enabled authentication in LM Studio |
   | Custom OpenAI-compatible | none — enter it | optional; also give it a **Display name** |

2. Check the **Base URL**. It is contacted by the Inventory Atlas server, not by your browser, so
   `localhost` means the machine or container running Inventory Atlas. If Inventory Atlas runs in a
   Proxmox container or in Docker and Ollama or LM Studio runs on your desktop PC, enter the PC's LAN
   address instead, for example `http://192.168.1.50:11434/v1` for Ollama or
   `http://192.168.1.50:1234/v1` for LM Studio. Ollama must then be started with
   `OLLAMA_HOST=0.0.0.0`, and LM Studio needs *Serve on Local Network*. Only use plain `http://` on
   your own network; the form warns when a remote address is not HTTPS.
3. Enter the **API key** if the provider needs one, and press **Test connection**. It reports how
   many models the provider offers, or explains what went wrong — an unreachable address, a rejected
   key, or a server that does not list its models.
4. Choose a **Model**. **Refresh models** reloads the list from the provider; OpenAI shows only the
   recommended models your key can use, and models known to be text-only are marked *(text only)*.
   Use **Custom model...** to type a model ID that is not listed, for example `llava:13b` in Ollama.
5. Set **Image input**. *Detect automatically* works for OpenAI and OpenRouter; for Ollama, LM
   Studio, or a custom server choose *Supported by this model* for a vision model and *Not supported
   (text only)* for a text model, which hides the photo option on **AI Add Item**.
6. Tick **Enable AI features** and press **Save settings**.

**Enable AI features** stays unavailable while OpenAI or OpenRouter has no key saved or typed into
the form, because AI cannot work without one. The saved key is shown only as a masked value
afterwards, and it belongs to the provider and base URL it was entered for: switching to another
provider or address removes it on save unless you enter a key again.

**Enable AI features** controls whether the AI actions exist in the interface at all. While it is
off, **AI Add Item** and **AI Add Fields** are not shown and `/items/ai` returns you to **Items**;
everything else, including **Batch Add Fields**, works unchanged. The setting takes effect as soon
as you press **Save settings**, with no page reload, and only the saved value counts: ticking the
switch without saving changes nothing elsewhere.

A new installation therefore starts with AI off and no key, and shows no AI actions until you
configure a provider. For OpenAI and OpenRouter the key is also what keeps AI on: ticking **Remove
the saved API key** switches AI features off in the same save, and they stay off until a new key is
saved.

## 4. Core concepts

| Concept | What it means |
| --- | --- |
| **Item** | One physical thing. It always has a name and a category, plus an automatically assigned UUID and created/updated timestamps. Purchase details, a serial number, and **Transferred To** are optional base fields available in every category. |
| **Category** | A group of items, such as `Cameras`. Category names are unique and case-insensitive. |
| **Custom field** | An extra field that belongs to one category. Types: Text, Number, Date, Boolean. Items of that category get the field in their form. |
| **Location** | A free-text note about where the object physically is, such as `Garage` or `Shelf 2`. An item stored inside another item is displayed at the location of its outermost container instead. |
| **Stored inside** | A real link to another item that contains this one, such as a lens inside `Box A`. |
| **Transferred To** | A free-text note about who or where an item went when it was lent, given away, sold, or otherwise transferred, such as `Vasyl` or `Sold via OLX`. It is informational only and never changes the location. |
| **QR code** | A code generated from the item's UUID, shown on request from the item page and printed on labels. It identifies the record and contains no address of your server. **Scan QR** reads it back and opens the item. |
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

1. Configure and enable an AI provider under **Settings → AI**, the same setup **AI Add Item** uses.
   Any text model works. The button appears only while AI features are enabled.
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
3. Optionally fill in **Condition**, **Location**, **Transferred To**, **Purchase Date**, **Purchase
   Price**, **Serial Number**, **Stored inside**, and **Description**. Purchase Price has separate amount and currency
   controls; clear the amount to leave the whole price unspecified.
4. Values for the category's custom fields appear under **Category fields**. Text fields suggest
   values you have already used (see below), boolean fields are a Yes/No list, number and date fields
   use the matching browser control.
5. Add photos, then press **Save item**.

Changing the category while filling in the form loads that category's fields.

### Add several items at once from JSON

1. Open **Items** and press **Batch Add from JSON** next to **Add item**.
2. Choose the **Category**. It starts at the category the list is filtered by, and every item of the
   batch goes into it.
3. Press **Insert Template**. It writes a document with two blank items that lists every item
   attribute and every custom field of the chosen category, so it always matches the category's
   current fields. Fill it in, add or delete entries in `items`, or paste a document produced
   elsewhere. A batch holds at most 100 items.
4. Press **Preview**. Nothing is saved yet. A document that cannot be read — invalid JSON, a
   different `category`, an unsupported property, an unknown custom field, more than 100 items — is
   reported as one message and stays in the editor for correction.
5. Review the item cards. Every value can be edited in place, and problems such as a missing name, a
   non-numeric number field, an invalid date, or an unknown currency are shown under the affected
   control. Press **Remove** to drop an item from the batch. **Edit JSON** goes back to the pasted
   text.
6. Press **Create N Items**. The button stays disabled while any item still has a problem. The whole
   batch is created at once: if anything fails, no item is created. The list then shows the category
   and a message with the number of created items. **Cancel** or `Escape` discards the draft.

The document cannot contain IDs, UUIDs, photos, or a containing item. Add photos and **Stored inside**
afterwards through each item's **Edit** form.

### Create an item from a photo or a description with AI

1. Configure and enable an AI provider under **Settings → AI**. The default OpenAI model is
   `gpt-5.6-luna`. To analyse photos the model must accept image input; with a text-only model the
   photo option is hidden (when **Image input** says so) or the request is refused with *The
   selected model does not support image input.*, and you can still work from a description.
2. Open **Items** and press **AI Add Item** next to **Add item**. The button appears only while AI
   features are enabled.
3. Supply a photo, a description, or both; at least one of them is required. **Item photo
   (optional)** accepts one JPEG, PNG, WebP, or GIF of at most 15 MB. **Item description (optional)**
   takes up to 2,000 characters: describe the item and add anything you already know, such as brand,
   model, serial number, condition, purchase information, or location. **Remove background** is
   offered only while a photo is selected and is off by default; it produces a locally processed
   final photo with the item centered on white.
4. Press **Create Draft** once. The button stays disabled until a photo or a description is present,
   shows progress, and cannot submit a duplicate request. If the request fails, the selected photo,
   the description, and the background-removal choice stay on the page so you can retry.
5. The normal item form opens with the suggested existing category, supported base and custom-field
   values, confidence, any warnings, and, when you supplied a photo, a preview of it ready to upload.
   A description-only draft opens with no photo, and you can add one there before saving. When background
   removal succeeds, this is a JPEG showing the item centered on a clean white background with a
   subtle shadow; otherwise the original is retained and a warning explains the fallback. Choose another photo in the normal file control at any time.
   Empty values remain empty. Review and edit every value; AI suggestions are not guaranteed to be
   correct.
6. Press **Save item** to create the record through the normal workflow. Leaving or reloading the
   review page before saving discards the temporary draft, and no inventory record has been written.

The request is always one AI provider request. A supplied photo is sent unresized (OpenAI reads it at original detail) so visible
brand, family, model, part, and serial markings remain readable, and a description-only request sends
no image at all. Facts you state and markings the model reads are both treated as evidence; when the
two disagree, the draft carries a warning naming the conflict instead of silently choosing one. Background removal runs independently on the local CPU with
IS-Net and never sends an additional provider request or consumes tokens. It takes a few seconds per
photo,
keeps whatever the model considers the foreground - including a hand holding the item - and places it
centered on white with a soft shadow. It does not search the
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

### Show the QR code of an item

1. Open the item from **Items** and press **QR Code**, next to **Edit** and **Delete**.
2. A small window shows the code, the item name, and the encoded text underneath.
3. The code contains only the item's UUID, in the form `ial:item:v1:<uuid>`. It holds no address of
   your server, so a code you print stays valid if the installation moves to another machine, port,
   or address, or if you restore the database elsewhere.
4. **Print Label** opens the label print view with just this item; see
   [Select items and print QR labels](#select-items-and-print-qr-labels).
5. Close the window with **Close**, the **×**, `Escape`, or a click outside it.
6. Boxes and other containers are ordinary items, so they get their code the same way.
7. The code is generated in your browser and is never stored or uploaded; no Internet access is
   needed for it.

### Select items and print QR labels

1. Open **Items** and tick the checkbox in front of each item you want a label for. On a wide screen
   the checkbox in the table header selects or clears every item on the current page; on a phone
   each card has its own checkbox.
2. The selection is kept while you page, search, filter, sort, or open an item and come back. The
   bar above the results shows how many items are selected; **Clear selection** empties it. A page
   reload also clears it.
3. Press **Print Labels**. It is disabled while nothing is selected.
4. The print view shows the number of selected items and a preview of every A4 page exactly as it
   will print. Choose a **Layout**:
   - **Large** — 8 labels per page (95 × 69 mm), the biggest codes;
   - **Standard** — 21 labels per page (63 × 39 mm), the default;
   - **Compact** — 30 labels per page (63 × 27 mm).
5. Under **Show on labels** choose what is printed next to the code. The QR code is always printed.
   **Item name** and **Description** are on by default; **Category** and **Location** are off. The
   location is the displayed one, so an item inside a container shows the container's location.
   Long names and descriptions are shortened to fit; the code itself never gets smaller.
6. The page count under the options grows with the selection; a selection is never limited to one
   page. Press **Print** to open the browser's print dialog, then pick a printer or **Save as PDF**.
   For exact label sizes, print at 100 % scale (*Default* or *Actual size*) on A4 paper.
7. Only the label sheets are printed, always black on white, even in dark mode. The dashed outline of
   each label is a cutting guide.
8. If a selected item has been deleted in the meantime, the print view says how many were skipped
   and prints the others.
9. Every label encodes only `ial:item:v1:<uuid>`, never the address of your server, so printed labels
   keep working after the installation moves or the database is restored elsewhere.

### Scan a QR code to open an item

1. Open **Scan QR** in the navigation. On a phone it is in the **☰** menu.
2. Allow the camera when the browser asks. The rear camera is used when the device has one.
3. Point the camera at an Inventory Atlas label. As soon as the code is read the camera turns off
   and the item page opens.
4. If the camera cannot start, the page says why and stays usable. Press **Scan from image** and
   choose a photo or a screenshot that shows the code; on a phone this can also take a new photo.
5. Only codes of the form `ial:item:v1:<uuid>` are accepted. Other results are shown on the page
   without leaving it:
   - *This is not an Inventory Atlas QR code.* — the code holds something else, such as a web
     address. It is never opened.
   - *This Inventory Atlas QR code is invalid or uses an unsupported format.* — the code starts like
     one of ours but is damaged or from another format version.
   - *Item not found.* — the code is valid but that item no longer exists in this database.
   - *No QR code was found in this image.* — try a sharper or closer picture.
6. Press **Scan again** to turn the camera back on, or **Scan from image** to try another picture.
   No page reload is needed.
7. Codes are read entirely in your browser. Camera frames and chosen images are never uploaded or
   stored; only the decoded item UUID is looked up on your server.

**Live camera needs HTTPS or localhost.** Browsers only allow camera access on secure pages. When
the application is opened over plain HTTP on a LAN address, such as `http://192.168.1.145:3000`,
**Scan QR** shows *Camera unavailable* and only **Scan from image** works. Opening the application
through HTTPS — for example with a reverse proxy on your LAN or with Tailscale HTTPS certificates —
enables the live camera.

### Search, filter, sort, and page through items

1. Open **Items**.
2. Type into **Search**. The search runs as you type and matches the item name, description, serial
   number, and **Transferred To** — not custom field values, condition, or location.
3. Narrow the list with **Category** (**All categories** by default).
4. **Sort by** Name, Category, Created, or Updated, with **Direction** Ascending or Descending.
5. On a wide screen the results are a table with photo, name, category, condition, location,
   **Stored inside**, and **View** / **Edit** buttons; the container name links to its own page. On a
   narrower window the location and the container move under the item name, and on a phone each item
   is a card with the same information and the same two buttons. The location shown is the inherited
   one for items that sit inside a container. An item with **Transferred To** shows a
   **Transferred to: …** badge under its name. The checkbox in front of each item selects it for
   label printing.
6. The list shows 12 items per page; use **Previous** and **Next** below the results. The total count
   is shown under the **Items** heading.

### Record where an item was transferred

1. Open the item's form (**Add item** or **Edit**).
2. Type the person or destination into **Transferred To**, for example `Vasyl`, `Father`, or
   `Sold via OLX`. Clicking into the field lists values already used on other items, most used first;
   choose one the same way as a custom-field suggestion, or type a new value. At most 255 characters.
3. Press **Save item**. The item page shows a **Transferred to: …** badge under the item name, and the
   **Items** list shows the same badge with the item.
4. To remove the note, clear **Transferred To** and save. The badge disappears.

The field is only a note: it does not change **Location**, **Stored inside**, or anything else, and it
keeps no history of earlier transfers. Search for the value on **Items** to list everything
transferred to the same person.

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

### Change the interface language

1. Open **Settings**. The first card, **Interface**, holds the **Language** selector.
2. Choose **English** or **Українська**. Every page, the navigation, and open dialogs switch at once;
   no reload is needed.
3. The choice is stored in this browser only and survives a reload. Other browsers and devices keep
   their own language, and a browser without a choice uses English.
4. Dates, numbers, prices, and file sizes follow the chosen language, for example `Nov 18, 2024` and
   `$49.99` in English, `18 лист. 2024 р.` and `49,99 USD` in Ukrainian. The stored values do not
   change.
5. Only the interface is translated. Item, category, and field names, descriptions, locations, and
   every other value you entered are shown exactly as saved. Messages sent by the server, such as
   validation errors, and the release notes in **Version History** are still in English.

### Download a backup

1. Open **Data / Backup**.
2. Press **Download backup**. The browser saves a file named `inventory-YYYY-MM-DD.sqlite`.

### Back up to Dropbox or Google Drive

**Settings → Cloud Backup** uploads the same snapshot to Dropbox or Google Drive, on demand or on a
schedule the server runs by itself. The operator has to set up the provider app once:

- **Dropbox**: create an app in the Dropbox App Console with **Scoped access** and **App folder**
  access, enable the `account_info.read`, `files.metadata.read`, and `files.content.write`
  permissions, and add the redirect URI shown on the Dropbox card. Its **Settings** tab shows the
  **App key** and **App secret**.
- **Google Drive**: in Google Cloud, enable the Google Drive API, configure the OAuth consent screen
  with the `…/auth/drive.file` scope (add yourself as a test user while the app is in testing), create
  an OAuth client of type **Web application** with the redirect URI shown on the Google Drive card. It
  gives you a **Client ID** and a **Client secret**.

The redirect URI must match the address in your browser exactly. Dropbox and Google accept plain
HTTP only for `localhost`, and Google does not accept a private IP address. On a LAN installation,
connect once through `http://localhost:3000` (for example over `ssh -L 3000:localhost:3000 <server>`)
or through an HTTPS host name such as a Tailscale `https://<host>.<tailnet>.ts.net` address; the
connection then keeps working from any address. Set `CLOUD_BACKUP_REDIRECT_URI` if the application
sits behind a reverse proxy.

1. Open **Settings** and scroll to **Cloud Backup**. On a card marked **Not configured**, enter the
   app key and app secret (Dropbox) or the client ID and client secret (Google Drive) under
   **App credentials** and press **Save app credentials**. The secret stays on the server: afterwards
   the form only shows its last four characters, and leaving the field blank keeps it. **Remove**
   deletes the saved credentials; disconnect the provider first. An operator can instead set
   `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET` or `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` on the server;
   those then take precedence and are shown read-only.
2. Press **Connect Dropbox** or **Connect Google Drive**, sign in, and allow access. You return to
   Settings with `Dropbox connected.` (or the reason it failed), and the card shows the account and the
   folder: `Apps/<your app>/Backups` in Dropbox, `My Drive/Inventory Atlas Lite/Backups` in Google Drive.
3. Press **Backup now** to upload a snapshot immediately. The message names the uploaded file,
   `inventory-atlas-lite-YYYY-MM-DDTHH-mm-ssZ.sqlite` (UTC). **Test connection** checks the account
   and the folder without uploading anything.
4. For automatic backups, tick **Enable automatic backups**, choose where to **Back up to**, the
   **Frequency** (and **Day of week** for weekly), and the **Time of day**, then press
   **Save schedule**. The time is in the server time zone shown under the fields. The server runs the
   backup itself, so no browser needs to stay open; a backup missed while the server was off runs once
   shortly after it starts again.
5. Under **Retention**, choose **Keep only the newest backups** and a number to remove older cloud
   backups after each successful upload. Only files named like the backups above in the application's
   own folder are ever removed.
6. **Status** shows the last successful backup, the last attempt and its error, the retention result,
   and the next scheduled run.
7. **Disconnect** removes the stored access from the server and revokes it at the provider. A schedule
   that used that provider is switched off. Files already uploaded stay in your cloud storage.

To restore a cloud backup, download it from Dropbox or Google Drive and use **Restore from backup**.

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

### Reset the inventory database

Resetting **permanently removes the whole inventory** — every item, photo, category, custom field,
and saved value — and leaves an empty database, as on a fresh installation. Application settings,
such as the AI settings and the API key, and all existing backups are kept.

1. Download a backup first if you might want the data again.
2. Open **Data / Backup** and scroll to the red **Danger Zone** at the bottom of the page.
3. Press **Reset Inventory Database**. The dialog asks the server for the current numbers and lists
   how many items, categories, custom fields, custom field values, and photos will be removed.
   Nothing has changed yet; **Cancel** closes the dialog.
4. Tick **I understand that all inventory data will be permanently removed.**
5. Type `RESET INVENTORY` exactly, in capitals. **Reset Database** stays disabled until both the
   checkbox and the phrase are in place.
6. Press **Reset Database** and wait. The page reports `Database reset completed.`, names the safety
   backup file that holds the removed inventory, and opens the now empty items list.

The confirmation is valid for five minutes and can be used once. If it has expired, or the reset
failed, the dialog shows the reason; press **Try again** to load fresh numbers and confirm again.
Before anything is removed, the server writes and verifies a **pre-reset safety backup**; if that is
not possible, the reset stops and nothing changes. If the replacement itself fails, the previous
inventory is put back automatically and the message says so. A reset cannot run while a restore or
another reset is running, and during the few seconds of the swap other changes and backup downloads
are refused.

To get the removed inventory back, restore the pre-reset safety backup: copy it from the server and
select it under **Restore from backup**.

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
4. During an update the panel shows five phases — **Download**, **Build**, **Back up**, **Install**,
   and **Verify** — with the current one highlighted, the exact step underneath (for example
   *Installing dependencies with npm ci* or *Snapshotting the SQLite database*), a short line about
   what a long step is doing, and the time elapsed. Building takes most of the time. The application
   restarts while this runs, so short connection failures are expected; the page waits for it to come
   back. If the server stays silent for more than three minutes, the panel says so and suggests
   checking that the container is still running on the Proxmox host.
5. When the new version is running, the panel reports *Update completed successfully.* and reloads
   the page. You may close the dialog while the update runs — it keeps going, and reopening **About**
   shows the same progress.
6. If the new version does not start correctly, the updater puts the previous version and the
   pre-update database back and the panel reports *Update failed.* with the restored version. The
   inventory is preserved. The technical details are in the container log
   (`journalctl -u inventory-atlas-lite-update`).
7. If the updater is killed before it finishes — for example because the container ran out of
   memory — it cannot report a result. After an hour, the updater's own time limit, **About** reports
   the update as failed and a new one can be started. A container with 2048 MiB of memory has room
   for the build; see [`proxmox.md`](proxmox.md#updating).

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

**Data / Backup → Danger Zone → Reset Inventory Database** writes a verified copy of the current
database to `pre-reset-backups/` next to the live database before it replaces the database with a
fresh, empty one — for example `/var/lib/inventory-atlas-lite/pre-reset-backups` on Proxmox or
`/data/pre-reset-backups` in Docker. These copies are never removed automatically; delete the ones
you no longer need. `ai-settings.json`, the pre-restore copies, and the updater's backups are not
touched by a reset.

**Settings → Cloud Backup** uploads the same snapshot to Dropbox or Google Drive, by hand or on a
daily or weekly schedule, and can keep only the newest N cloud copies. The provider access and the
app credentials entered in Settings are stored in `cloud-backup-credentials.json` under `DATA_DIR` (readable only by the service user) and the
schedule and history in `cloud-backup.json`; neither is part of a SQLite backup, so back them up or
reconnect the provider when moving an installation.

For a personal homelab, download a backup after every larger cataloguing session, or schedule a cloud
backup, and keep the copies on a different machine than the server.

## 8. Limitations and security

- **No authentication, no user accounts, no permissions.** Everyone who reaches the address has full
  access.
- Not intended for direct exposure to the Internet. Use a trusted LAN or a VPN; do not forward a
  router port and do not put it behind a public reverse proxy.
- Photos: JPEG, PNG, WebP, GIF, up to 10 files of 15 MB each per upload.
- Search covers the item name, description, serial number, and Transferred To.
- A category used by any item cannot be deleted, and an item containing other items cannot be
  deleted.
- Deleting a custom field also deletes the values saved for it on every item of that category.
- Custom field types cannot be changed after creation, and categories cannot be merged. The batch
  editor only creates new fields; it never renames or retypes existing ones.
- Restore replaces the whole inventory from a full SQLite backup. There is no merge, no selective
  restore of single items or categories, and no CSV import or any export.
- **Batch Add from JSON** only creates new items, at most 100 per batch, in one existing category.
  It never creates categories or fields, updates existing items, or imports photos.
- Anyone who reaches the unauthenticated interface can restore a backup or reset the inventory and
  therefore replace or remove all current data. The typed confirmation and the single-use token only
  guard against accidents, not against a person with access. Keep the application on a trusted LAN
  or VPN.
- An inventory reset removes everything at once. There is no selective reset of single tables,
  categories, or items, and it never deletes settings or backups.
- AI Add Fields sends your description, the category name, its field names, and the built-in
  attribute names to the configured AI provider. It only proposes fields; the fields are created by the same reviewed
  batch as a pasted document, and a failed request changes nothing.
- AI Add Item sends the selected image, your description, and category/field definitions to the
  configured AI provider, which is outside the local deployment unless you use a local model server.
  The original image is stored only after you confirm the draft. The provider settings and key stay
  in `ai-settings.json` under `DATA_DIR` and are not part of SQLite backups, so move or reconfigure
  them separately.
- Only providers with an OpenAI-compatible API are supported, one at a time. Whether a model accepts
  photos is detected only for OpenAI and OpenRouter; for other servers set **Image input** yourself.
  Small local models may return unusable answers, which are reported and never saved.
- The interface is available in English and Ukrainian only. Server messages, including validation
  errors, and the release notes are shown in English in both languages.
- Autocomplete is offered for text custom fields and **Transferred To** only, not for the name,
  condition, location, or description.
- The live camera in **Scan QR** needs the application to be opened over HTTPS or on `localhost`.
  Over plain HTTP only **Scan from image** is available. The scanner reads Inventory Atlas item
  codes only; it does not open other QR codes or read barcodes.
- A label print job holds at most 500 items; a larger selection is refused with a message instead of
  being cut short. Labels come in three fixed A4 layouts; there is no label designer, custom label
  size, or barcode other than the QR code. The label selection is not saved and a page reload clears
  it.
- Updating from **About** is available on the Proxmox/LXC installation only. Docker, manual, and
  development installations can check for a newer release but must be updated where they are
  deployed. Only published stable releases are offered, always from the official repository, and the
  application never gains any other privilege on the machine.
- Anyone who reaches the unauthenticated interface can start such an update. Keep the application on
  a trusted LAN or VPN.
- Cloud backup supports Dropbox and Google Drive, one schedule for one provider at a time. Anyone who
  reaches the interface can connect or disconnect a provider and start a cloud backup. Backups are
  restored by downloading the file from the provider and using **Restore from backup**; there is no
  direct restore from the cloud.

## 9. Quick troubleshooting

| Symptom | What to check |
| --- | --- |
| The page does not open | Confirm the address and port, and that you are on the same LAN or VPN. On Proxmox, check that the container runs with `pct status <CTID>`. |
| The page opens but shows errors | The API may be down. On Proxmox: `systemctl status inventory-atlas-lite` inside the container. `GET /api/health` answers `{"status":"ok",…}` when the server and the database are fine. |
| A category cannot be deleted | Items still use it. The message says how many; move them to another category or delete them. |
| An item cannot be deleted | It still contains other items. Open it, move or delete everything under **Contents**, then delete it. |
| A photo is rejected | Only JPEG, PNG, WebP, and GIF are accepted, at most 10 files of 15 MB each per upload. |
| Search finds nothing | The search matches the name, description, serial number, and Transferred To. Clear the category filter and check that you are on page 1. |
| No suggestions in a text field | Suggestions come from values already saved for that same field. A newly created field starts empty. |
| AI Add Item is missing | AI features are off. Open **Settings**, choose a provider, enter its API key if it needs one, choose a model, tick **Enable AI features**, then save. The AI actions appear immediately. |
| Enable AI features cannot be ticked | OpenAI and OpenRouter need an API key and none is saved for this provider and base URL. Enter a key in the same form; the switch becomes available at once. |
| *Could not reach Ollama/LM Studio at …* | The address is resolved on the Inventory Atlas server. In a Proxmox container or Docker, `localhost` is the container itself: use the LAN address of the computer running the model server, and make that server listen on the network. |
| *The selected model does not support image input.* | The model cannot read photos. Choose a vision model, or describe the item instead. |
| No model list, but the connection works | Some servers do not list their models. Choose **Custom model...** and type the model ID. |
| AI Add Fields suggests nothing usable | The message reports an empty or malformed answer. Describe the category in more detail and press **Generate Fields** again; your description is kept. |
| AI analysis fails | Read the message for an invalid key, rate limit, unavailable provider, timeout, unsupported image, or missing category. The selected photo and description remain available for retry. |
| Cloud Backup says *Not configured* | No app credentials are saved for that provider. Enter them under **App credentials** on its card, or set `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET` or `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` on the server and restart. |
| The app key or client ID cannot be edited | The provider is connected, and its access only works with that app. Press **Disconnect** first. If the section says the credentials come from the server environment, change them there. |
| The provider reports a redirect URI mismatch | Register the redirect URI shown on the card exactly, and open the application at that same address. Use `localhost` or an HTTPS host name; Google rejects private IP addresses. |
| *… access has expired or was revoked* | The provider no longer accepts the stored access. Press **Disconnect**, then connect the provider again. |
| Scan QR says *Camera unavailable* | Over plain HTTP the browser does not offer the camera; use **Scan from image** or open the application over HTTPS. If camera access was denied, allow it for this site in the browser settings and reload the page. |
| Printed labels are the wrong size or spill onto extra pages | In the browser's print dialog choose A4 paper and 100 % scale (*Default* or *Actual size*) instead of *Fit to page*. |
| Which version is this | Open **About** in the navigation. It shows the version, the commit the build came from, and its date. **Version History** in the same dialog lists what changed in each release. |
| Where are the logs | On Proxmox, inside the container: `journalctl -u inventory-atlas-lite -f`. See [`proxmox.md`](proxmox.md) for the other service commands. |
