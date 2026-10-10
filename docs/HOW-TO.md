# Inventory Atlas Lite — Quick How-To

A short guide for someone who has already deployed Inventory Atlas Lite and wants to start using it.
Official downloads are on [GitHub Releases](https://github.com/bloschinsky/inventory-atlas-lite/releases).
For installation on Proxmox VE see [`proxmox.md`](proxmox.md); for the technical boundaries of each
feature see [`features/README.md`](features/README.md).

## 1. What Inventory Atlas Lite does

Inventory Atlas Lite is a small self-hosted catalogue of physical things you own: tools, cameras,
lenses, cables, spare parts, boxes in the garage. For every item you record a name, a category,
whether it is new, an optional condition grade with condition notes, location, description, purchase details, serial number, where the item was
transferred to, your own custom fields, and photos.

All inventory records and original photo bytes live in one SQLite database on your server. Normal
use needs no external service. The optional AI features send the selected photo, your written
description, and your category/field schema to the AI provider you configure — OpenAI, OpenRouter, a
local Ollama or LM Studio server, or another OpenAI-compatible endpoint — only when you ask for a
draft. A hosted provider needs Internet access; a local model server on your network does not.

**There is no authentication.** Anyone who can open the address can read and change the whole
inventory, so keep it on a trusted LAN or behind a VPN.

**Try it before installing.** The [public demo](https://bloschinsky.github.io/inventory-atlas-lite/demo/)
(also **Try Demo** on the product page) runs the same interface in your browser on an invented
inventory with photos, containers, checklists, and a filled Dashboard. A **Demo mode** strip at the
top marks it. You can add, edit, move, and delete items, but nothing is saved: reloading the page or
pressing **Reset demo** brings back the sample inventory. **Guided tour** in the lower-right corner
is a presentation in eight chapters — the Dashboard, Categories & Fields, Hierarchy, adding an item,
finding items, Templates, Checklists, and what changed — on the real pages. Each scene explains one
thing and waits: its blue button says what happens next (*Group by Category*, *Search for Nikon*,
*Save the Item*), and pressing it makes the real page do it. When a chapter is complete, press
**Next**. The small buttons go **Back** a chapter, **Replay chapter**, **Skip chapter**, and turn
**Auto Play** on, which presses the scene buttons for you after a short reading time; with Auto Play
on, **Pause** and **Resume** hold it. Close the tour at any time to explore on your own. On a phone
the tour card is a slim strip at the bottom of the screen. Starting the tour again begins from the
sample inventory. Download Backup, Restore, the Danger Zone,
Settings → Cloud Backup and AI, and Check for updates need a real installation and say *Not
available in the public demo* instead.

The product page and the demo speak English and Ukrainian. Pick the language in the product page's
language menu (the language icon in the top bar); **Try Demo** then opens the demo, its sample
inventory, and its guided tour in that language, and the demo address carries it as `?lang=uk` or
`?lang=en`, so a shared demo link opens in the same language. In the demo, changing the language in
**Settings → Interface** reloads the sample inventory in the new language — the strip confirms it —
which discards your demo changes and closes an open guided tour. Your own installation never
changes or translates your data when you change the language.

This guide is also published on the product site as the
[User Guide](https://bloschinsky.github.io/inventory-atlas-lite/guide/) (**Guide** in the product
page's top bar, or **Read the user guide**), in English and Ukrainian with the same language menu. It
adds a table of contents — **On this page** on a phone — screenshots, small diagrams, and
**Try this in Demo** buttons that open the page a section describes in the demo, in the guide's
language. Sections about features that need a real installation say *Requires a self-hosted
installation* instead. Every heading has a link to copy, and the address keeps the section through a
reload and a language change.

## 2. Before you start

- Open the address of your installation in a browser, for example `http://192.168.1.145:3000`. A
  Proxmox installation prints this URL at the end; Docker and manual installations use the server
  address and `PORT` (default `3000`).
- Use a current desktop or mobile browser. On a wide screen the pages and **About** sit in
  a narrow icon sidebar on the left: move the mouse over it — or move the keyboard focus into it
  with `Tab` — and it slides open over the page with the full labels. On a phone or a narrow tablet
  the same list opens from the **☰** button in the top bar. On a wide screen the pages use the
  whole width beside the sidebar, so the Dashboard, the Items table, and the Hierarchy get more room;
  forms such as Add Item stay at a comfortable reading width.
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
   **Field name**, choose the type (Text, Number, Date, Boolean, Color), and press **Add**.
3. Go to **Items** and press **Add item**. Fill in **Name** and **Category** — both are required —
   and any other values you want.
4. Select photos at the bottom of the form. They are uploaded when you save the item; the first one
   is the cover.
5. Fill in **Location** (free text, such as `Garage`) and, if the item sits inside another item you
   have already recorded, set **Stored inside**.
6. Press **Save item**. You land on the item page; check that it also appears on **Items** and that
   the search finds it by name.
7. Open **Data / Backup** and press **Download backup** to get your first copy of the database.

To use the AI features, open **Settings → AI** and fill in its **Connection** and **Model** cards:

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
   many models the provider offers (for OpenAI, how many it returned and how many of them are
   candidates for AI features), or explains what went wrong — an unreachable address, a rejected key,
   or a server that does not list its models.
4. Choose a **Model**. Models known to be text-only are marked *(text only)*. Use **Custom
   model...** to type a model ID that is not listed, for example `llava:13b` in Ollama.
   - With OpenAI the list shows every GPT model your key can use, so a new GPT generation appears
     without an Inventory Atlas update. **Recommended / Latest** holds the newest generation, and
     **Previous generations** a few models of each older one, newest first. Models verified with
     Inventory Atlas are marked *(verified)*, keep their place by version, and are always listed.
     **Show all models** adds the other models, such as dated snapshots; speech,
     embedding, image-generation, moderation, and realtime models are never offered.
   - Below the list you see the exact **Model ID** and what is known about the model: *Vision* and
     *Structured output* are *Supported*, *Not supported*, or *Unknown*. A model that is not verified
     stays *Unknown* until you try it.
   - The OpenAI list is remembered for 24 hours, so reopening Settings does not ask OpenAI again.
     **Refresh models** always loads a new list. If that fails, the last list stays visible with the
     time it was checked and the reason.
   - Refreshing never changes your model. A saved model that the provider no longer lists stays
     selected, marked *(not in the provider's list)*, until you choose another one and save.
5. Set **Image input**. *Detect automatically* works for OpenAI's verified models and for OpenRouter;
   for any other model the photo is sent and a refusal is reported. For a vision model on Ollama, LM
   Studio, or a custom server choose *Supported by this model*, and choose *Not supported (text
   only)* for a text model, which hides the photo option on **AI Add Item**. This choice always
   takes precedence over what the model list says.
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
| **Custom field** | An extra field that belongs to one category. Types: Text, Number, Date, Boolean, Color. Items of that category get the field in their form. |
| **Location** | A free-text note about where the object physically is, such as `Garage` or `Shelf 2`. An item stored inside another item is displayed at the location of its outermost container instead. |
| **Stored inside** | A real link to another item that contains this one, such as a lens inside `Box A`. |
| **Transferred To** | A free-text note about who or where an item went when it was lent, given away, sold, or otherwise transferred, such as `Vasyl` or `Sold via OLX`. It is informational only and never changes the location. |
| **QR code** | A code generated from the item's UUID, shown on request from the item page and printed on labels. It identifies the record and contains no address of your server. **Scan QR** reads it back and opens the item. |
| **Photo** | An image stored inside the database together with the item. |
| **Template** | A reusable preset of default values for new items of one category. Using it prefills the **Add item** form; it is never an item itself and the items created from it stay independent. |
| **Checklist** | A reusable list of existing items, such as `Film Trip Kit`, in **Packing** or **Verification** mode. It only references items; it never copies them into a second inventory. |
| **Checklist run** | One use of a checklist, with its own copy of the item list and a Pending, Packed/Present, or Missing state per item. Every start is a new run, so earlier results stay in the history. |
| **Container audit** | A Verification run started with **Audit contents** from an item that holds other items. It checks what the container held when the audit started and is kept as history, not as a reusable checklist. |
| **Last verified** | When the item was last confirmed **Present** in a completed Verification run or container audit. It is set only by completing such a run, never by editing, moving, or packing, and shows **Never** until then. |
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

1. Open **Dashboard**, the application's default landing page. Every card describes the active
   inventory: retired items are not counted, and the first card links to them with a line such as
   *2 retired items are not counted*. Its four summary cards show the
   total item count, a photo coverage gauge with the counts of items with and without photos, a
   placement bar with its three counts, and the items added during the rolling last 30 days with a
   small chart of each day. Hover or tap a chart for its tooltip; the important numbers are always
   also shown as text.
2. Use **Category** to limit every card except **Items by category** to one category. The selection
   is stored in the page URL, so a reload or copied link preserves it. Press **Reset** to return to
   **All categories**.
3. **Items by category** is a treemap that always represents the complete inventory for context.
   Click a category tile, or press one of the category buttons below the treemap (they also work with
   the keyboard), to apply it as the filter; the selected category stays blue while the others turn
   gray. Only the six largest categories are shown separately, with smaller groups combined under
   **Other**, which cannot be selected; an actively selected smaller category remains visible.
4. **Condition breakdown** is a donut chart of the filtered items by their **Condition** grade, always
   in the order Excellent, Good, Fair, Poor, Broken, then **Not set**, with the same colors as the
   Condition badges and the count of each listed below it. Condition Notes are not counted.
5. **Placement status** counts each item exactly once: first as **Inside a container**, otherwise as
   **Direct location** when it has location text, or as **Unplaced**. It uses each item's own saved
   location, not the inherited one. Containers themselves remain normal inventory items.
6. **Field coverage** shows, for Photos, Placement, Condition, Purchase date, Purchase price, and
   Serial number separately, how many of the filtered items have the field filled in (Condition counts
   items with a grade), both as a radar
   chart and as a list such as `82% (164 / 200)`. A purchase price counts only with both an amount
   and a currency. There is no combined score.
7. **Items by location** counts the filtered items by the location the Items list displays: an item
   inside a container counts at the location of its outermost container. Locations that differ only
   in capitalization or surrounding spaces are counted together. The seven largest locations are
   shown, the rest under **Other**, and items without any location under **Unknown**.
8. A category with no items displays a normal zero-data view. If loading fails, press **Retry**.

The database records `created_at` with SQLite `CURRENT_TIMESTAMP`, which is UTC. The Dashboard uses
the server's UTC clock and includes records whose timestamp is at or after 30 days before the
request. Because that window starts partway through a day, its daily chart has 31 UTC days: the
partial first day through today.

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
3. Press **Rename** next to a field, enter the new name, and confirm. The field keeps its type and
   category, and every value already saved on items and templates stays and appears under the new
   name. The new name must still be unique within the category, ignoring case.
4. Press **Delete** next to a field to remove it. The confirmation warns that saved values may also
   be deleted — deleting a field deletes that field's values on every item of the category.

Field types are fixed after creation; to change a type, delete the field and add a new one.

After a rename, use the new name in Batch Add from JSON: the generated template already does, and a
document that still uses the old name is refused as an unknown custom field. On **Items**, columns
follow the new name: same-name, same-type fields of different categories merge into one column, so a
rename can split a merged column or join an existing one. A column you had shown under the old name
is no longer shown; turn the column of the new name on under **Columns**.

### Add several fields at once

1. Select a category and press **Batch Add Fields** under the field form.
2. Paste a field-definition document. It lists up to 50 fields, each with a `name`, a `type`
   (`text`, `number`, `date`, `boolean`, or `color`), and an optional `"required": false`:

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
3. Turn on **New** if the item is new or unused; it starts off. The item page and the **New** list
   column show it as a green **New** or an amber **Used** badge. **Condition** is separate from New:
   choose one grade — **Excellent**, **Good**, **Fair**, **Poor**, or **Broken** — or leave it **Not
   set**; the chosen grade is shown as its colored badge. Press the info button beside **Condition**
   to open **Condition grading**, which explains every grade; close it with **Close**, ×, Escape, or a
   click outside. Put details such as *Small crack near the left hinge* in **Condition Notes**.
   Optionally fill in **Condition**, **Condition Notes**, **Location**, **Transferred To**, **Purchase Date**, **Purchase
   Price**, **Serial Number**, **Stored inside**, and **Description**. Purchase Price has separate amount and currency
   controls; clear the amount to leave the whole price unspecified.
4. Values for the category's custom fields appear under **Category fields**. Text fields suggest
   values you have already used (see below), boolean fields are a Yes/No list, number and date fields
   use the matching browser control. A **Color** field shows twelve named swatches — Black, White,
   Gray, Brown, Beige, Red, Orange, Yellow, Green, Blue, Purple, and Pink — and **Custom**. Click a
   swatch to choose it, or move through them with the arrow keys; the chosen one gets a checkmark, and
   the line below names it with its HEX code. **Custom** opens a color picker and a HEX box for any
   color such as `#A08C75`. Nothing is chosen until you pick a color, and **Clear** leaves the field
   not set. A custom color always stays Custom, even when it matches a preset. The item page, the
   Items table, and the cards show a color as its swatch and name, never as raw data.
5. Add photos, then press **Save item**.

Changing the category while filling in the form loads that category's fields.

**Add item** is a split button: its main part opens the blank form described above, and the arrow
next to it opens a menu with **Blank item** (the same blank form), **From template…** (see below),
and **AI Add Item** while AI features are on.

### Duplicate an item

To add another item much like an existing one — `Box #2` after `Box #1`, for example — open the
existing item and press **Duplicate**. The **Add item** form opens with all of the item's values,
including its custom fields, and a note naming the source item. Nothing is created yet.

1. Change what differs, at least the **Name**. A copied **Serial Number** carries a reminder that
   serial numbers are often unique; clear or change it if needed.
2. **Stored inside** starts empty and no photos are selected: choose a container or add photos if
   the new item needs them.
3. Press **Save item**. The result is a separate, ordinary item with its own QR code. The source item
   is not changed, and editing or deleting either item later never affects the other.

### Save and use item templates

A template is a reusable preset for items you add often, such as `Cardboard box 5 kg` or
`Seagate IronWolf 4 TB`. It is not an item: it never appears in **Items**, is not counted on the
Dashboard, and has no QR code, photos, or container. Using a template never creates an item by
itself — it opens the regular **Add item** form prefilled, and the item is created only when you
press **Save item** there.

1. Open **Templates** in the navigation and press **Add template**.
2. Enter a **Template name**, which is how the template is listed, and choose a **Category**. Both
   are required.
3. Fill in only the values new items should start with: **Default item name**, **New** (**Not set**,
   **No**, or **Yes**; Not set leaves new items at No), **Condition** (a grade or **Not set**),
   **Condition Notes**, **Location**, **Transferred To**, **Purchase Date**, **Purchase Price**, **Serial Number**,
   **Description**, and the category's custom fields. Every value is optional; an empty field stays
   empty in new items, a Boolean field can stay **Not set**, and a Color field can stay unchosen. Values are checked with the same
   rules as an item. Changing the category loads that category's fields.
4. Press **Save template**. The list shows each template's name, category, default item name, and
   when it was last modified, sorted by name; **Search** filters it by name, category, or item name.

To create an item from a template, press **Use** in the template's row, or open **Items**, press the
arrow next to **Add item**, choose **From template…**, and pick the template. The **Add item** form
opens with the template's values and a note naming the template. Change anything you like, add
photos, and press **Save item**. The new item keeps no link to the template: editing or deleting the
template later never changes items created from it.

To start a template from an existing item, open the item and press **Save as template**. The template
editor opens with the item's category, base fields, and custom field values, and its name as the
template name. Nothing is saved yet. Clear values that belong only to that one item — a serial
number or purchase date, for example — and press **Save template**. Photos and the container are
never copied into a template.

**Edit** in a template's row changes the template, and **Delete** removes it after a confirmation.

If a custom field used by a template is deleted, the template keeps working without that value, and
the template editor and the prefilled item form show `Some template fields no longer exist and were
ignored.` If the template's category is deleted, the template stays in the list marked **Category
missing** and its **Use** button is disabled. Press **Edit**, choose a category, and save to repair
it; another category is never chosen for you.

### Pack or verify items with a checklist

A checklist is a reusable list of items you already have in the inventory, such as a `Film Trip Kit`
you pack before every trip or a `Camera shelf` whose contents you check now and then. The checklist
itself holds no ticks: each time you start it, the application creates a separate **run** with its own
copy of the item list, so every earlier result stays readable in the history.

1. Open **Checklists** in the navigation and press **Add checklist**.
2. Enter a **Name** and, if you like, a **Description**. Choose the **Mode**: **Packing** (*What do I
   need to take or pack?*) or **Verification** (*Are the expected items physically present?*).
3. Under **Add inventory items**, search by name, description, or serial number. Every result shows
   its category, location, and container, so items with similar names can be told apart. Press **Add**
   on each item you need; the form stays open, and an item that is already in the list shows
   **Added** and cannot be added twice. Items cannot be created from here.
4. Under **Checklist items**, the arrows move an entry up or down and **×** removes it. The order you
   set is the order of every run; nothing is sorted for you.
5. Press **Save checklist**. The checklist page shows the description, the mode, the expected items,
   and the **Run history**.

To use the checklist, press **Start** — on the checklist page or on its card under **Checklists**. A
run opens with every item **Pending**. For each item press **Packed** (or **Present** in a
Verification checklist) or **Missing**; press **Pending** to undo a mistake. You can add a short note
to any item, for example `Left at home`. Every change is saved at once, so you can reload the page or
come back later: an unfinished run is offered as **Continue run** on its checklist page. The top of
the run shows the progress, such as `5 / 6 checked` with the number of packed or present, missing,
and pending items; a missing item counts as checked, but not as packed or present. The link icon of
an item opens its item page.

Press **Complete checklist** when you are done. If some items are still pending, the application asks
`3 items are still pending. Complete this run anyway?` first. A completed run is read-only history.
**Run again** — on the completed run or on the checklist page — always starts a new run with every
item pending again; the earlier run is never reset. The **Run history** on the checklist page lists
every run with its start time, status, and the packed or present, missing, and pending counts; open a
run to see exactly what was checked.

Editing a checklist changes only future runs. Runs that already exist keep the checklist name, mode,
and item names they started with, even if you later rename an item. Moving an item to another
location or container never changes the checklists it belongs to.

Deleting an inventory item is never blocked by a checklist. The checklist then shows the entry as
**Deleted item** under its last known name; remove it or add a replacement when you next edit the
checklist. Deleted items are skipped when a run starts, and runs that already contain the item keep
it under its name.

A retired item stays on its checklists with a **Retired** badge, and the checklist page warns how many
of its items are retired. New runs and container audits leave retired items out, and the run page
says how many were left out. Runs that already contain the item keep it, marked **Retired**.

**Delete** on a checklist, after a confirmation, removes the checklist and its item list but keeps
its runs. They are listed under **Runs of deleted checklists** on the **Checklists** page and stay
readable. Checklists and runs are part of the SQLite database, so backups, restores, cloud backups,
and the inventory reset include them.

Completing a **Verification** run sets **Last verified** on every item marked **Present** to the time
it was marked; the item page shows it in its **Details** card, or **Never**. Missing and Pending items
keep their earlier value, a Present mark taken back before completion leaves no trace, and an item
always keeps its newest verification. **Packing** runs never change **Last verified**. There is no
button to set it by hand, and it cannot be edited in the item form.

### Audit the contents of a container

1. Open an item that holds other items, such as `Box B4`. Its **Storage** card lists them under
   **Contents**.
2. Press **Audit contents**. The dialog shows how many items will be checked. When something inside
   holds further items, choose the **Scope**: **Direct contents** (the default: only the items stored
   directly in this one) or **All nested contents** (everything inside, at any depth). The container
   itself is never part of its audit.
3. Press **Start audit**. The run page opens as **Audit: Box B4**, with every item **Pending**. Mark
   each item **Present** or **Missing** and press **Complete checklist**, exactly as in any run.

The audit's list is fixed when it starts: moving an item into or out of the box afterwards does not
change it. Completing it sets **Last verified** on the Present items. It never moves an item, takes a
Missing item out of the box, or changes any location; open a Missing item's page from the run if you
want to update it yourself.

The container's page then lists its **Recent audits** with the date, status, and present, missing,
and pending counts; open one to see the whole run, or press **Run again** there to audit the box
again with the same scope. Audits do not add checklists to the **Checklists** page: they are listed
together under **Audit history** there. Renaming the container later keeps the old name in its
audits, and deleting the container keeps its audits readable.

### Add several items at once from JSON

1. Open **Items** and press **Batch Add from JSON** next to **Add item**.
2. Choose the **Category**. It starts at the category the list is filtered by, and every item of the
   batch goes into it.
3. Press **Insert Template**. It writes a document with two blank items that lists every item
   attribute and every custom field of the chosen category, so it always matches the category's
   current fields. Fill it in, add or delete entries in `items`, or paste a document produced
   elsewhere. `"new": true` marks an item as new; leave it out or set `false` otherwise. Only
   `true` or `false` is accepted. `"conditionGrade"` is one of `"excellent"`, `"good"`, `"fair"`,
   `"poor"`, `"broken"`, or `null`, and `"conditionNotes"` is free text. Older documents with a
   `"condition"` text are still accepted: that text becomes the Condition Notes, never a grade. A
   Color field takes `{ "key": "brown", "hex": "#795548" }` — one of the twelve color keys
   (`black`, `white`, `gray`, `brown`, `beige`, `red`, `orange`, `yellow`, `green`, `blue`,
   `purple`, `pink`) with that color's own HEX code, or `"custom"` with any `#RRGGBB` code — the
   same object written as a JSON string, or `null`. A batch holds at most 100 items.
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
   Empty values remain empty. A Color field gets a named color only when the evidence clearly fits
   one, an exact HEX only when a specific shade is clear, and stays unset otherwise. Review and edit every value; AI suggestions are not guaranteed to be
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

Deleting removes the record for good. For something you sold, gave away, lost, or used up, **retire**
it instead, so its photos and details stay available.

### Retire an item and restore it

Retiring marks an item that has left your inventory — sold, gifted, lost, stolen, disposed of, used up,
or another reason — without deleting anything. A retired item keeps its photos, serial number, QR code,
New/Used flag, Condition, purchase data, and custom fields, but it no longer counts as current
inventory. Lending an item to someone is not a retirement; use **Transfer** for that. An item on loan,
or a container with something on loan inside it, is retired only after the loan is marked as returned,
and a retired item cannot be lent.

1. Open the item and press **Retire item**.
2. Choose the **Reason** (required). **Retired on** is now by default; change it if the item left
   earlier. It cannot be in the future. **Recipient or context** (for example the buyer) and **Note**
   are optional.
3. If the item is a container with items inside, choose first:
   - **Retire the container and all items inside it** retires everything inside it, at every depth,
     in one step with the same details. The contents stay nested inside the container.
   - **Move the contents out first** retires nothing. Move the contents elsewhere (open each one, or
     select them on **Items** and use **Move to…**), then retire the container.
4. Press **Retire**. The item page shows a gray **Retired** badge and a **Retirement** card with the
   reason, the date, the recipient and note, the **Last location** it had, and its **Former container**.
   These are a snapshot: renaming or moving the former container later does not change them.
5. A retired item leaves its container, so active items are never hidden inside something that is
   gone. Its own saved **Location** is kept unchanged.

Retired items are hidden by default. On **Items** and **Hierarchy**, choose **Retired** under
**Inventory** to see only them, or **All** to see everything; **Active** is the default. The Dashboard
counts only active items and shows how many are retired under the total. Direct links and QR codes of a
retired item still open it.

To bring an item back, open it and press **Restore to inventory**. Choose where it goes: **On its own,
at a location** (its saved location is filled in; change or clear it) or **Inside an active container**
(search and pick one). It is never put back into its former container automatically. Everything that
was retired inside it comes back with it and stays inside it. Restoring keeps the same item, UUID,
photos, and details, and clears the retirement details.

An active item can only be stored inside an active container, and a retired item only inside a retired
one, so **Move to…** refuses a selection that contains retired items. **Delete** stays a separate
action.

### Add, view, order, and remove photos

1. Photos are added through the item form, at the bottom, under **Photos**. Select one or several
   files and save. Choosing files again adds them after the ones already shown; a file that is not
   uploaded yet is marked **Not saved**.
2. Up to **10 images per upload, 15 MB each**. Supported formats are JPEG, PNG, WebP, and GIF; other
   files are rejected by the server.
3. The item page shows one large photo at a time. With several photos it becomes a carousel: the
   arrows over the left and right edge of the image move one photo, the small bars at the bottom of
   the image jump straight to a photo, and a `1 / 3` counter below shows where you are. You can also
   swipe on a touch screen or drag with the mouse. Nothing changes on its own. It opens on the cover
   photo.
4. **The first photo is the cover.** It is marked **Cover** in the form, opens first on the item page,
   and is the thumbnail in the Items list, the Hierarchy, the contents of a container, and checklists.
   To change it, press the star (**Make cover**) under any other photo in the item form, or reorder the
   photos with the left and right arrows (**Move photo left** / **Move photo right**). A newly selected
   file can become the cover too. The new order is saved with **Save item**. If the photos changed in
   another tab meanwhile, saving reports it; reload the item and try again.
5. Delete a photo with **Delete photo** under it on the item page, or with the trash button under its
   tile in the edit form. Both act immediately after confirmation and are separate from deleting the
   item; a **Not saved** file is simply dropped from the selection. Deleting the cover makes the next
   photo the cover.

### Show the QR code of an item

1. Open the item from **Items** and press **QR Code**, next to **Edit**, **Duplicate**, and **Delete**.
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
   reload or a completed **Move to…** also clears it.
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
   number, **Transferred To**, and the values of **text** custom fields — whether or not their column
   is shown. It does not match condition, condition notes, location, or number, date, yes/no, and color fields.
3. Narrow the list with **Category** (**All categories** by default) and **Condition** (**All
   conditions**, one grade, or **Not set**). **Inventory** chooses **Active** (the default), **All**,
   or **Retired** items; the choice is kept while you move around during this browser session, and a
   new session starts with **Active** again. Retired items show a gray **Retired** badge and a faded
   photo. When a category has a **Color** field, a color filter appears beside **Condition**, named
   after the field (or **Color** when there are several color fields, each in its own group): **All
   colors**, one of the twelve colors, **Custom** (every custom shade, whatever its HEX code), or
   **Not set** (items of the categories with that field that have no color).
4. Choose what the list shows with **Columns**: tick or untick Photo, Category, Condition, Condition
   Notes, New, Location,
   **Stored inside**, Purchase Date, Purchase Price, Serial Number, Transferred To, Created, Updated,
   and your custom fields. **Name** always stays. Custom fields with the same name and type in
   different categories share one column, so one **Brand** column shows the brand of every category
   that has it; two fields with the same name but different types are listed separately with their
   type in brackets. **Reset to default** returns to Photo, Name, Category, Condition, Location, and
   **Stored inside**. The choice and the sort are remembered in this browser only.
5. On a wide screen, click a column header to sort by it; the first click sorts ascending, the next
   one descending, and an arrow marks the sorted column. Photo and **Stored inside** do not sort.
   **Condition** sorts by grade from Broken to Excellent (or back), with **Not set** always last. A
   **Color** column sorts in palette order from Black to Pink, then Custom, with unset colors last.
   Empty values are always listed last, numbers and prices sort by amount (whatever the currency),
   and dates by date. The sort covers the whole filtered list, not just the page on screen, and
   changing it returns to the first page.
6. On a wide screen the results are a table with the chosen columns and **View** / **Edit**
   buttons; a missing value shows as **—**, and the container name links to its own page. The table
   scrolls sideways when many columns are chosen. On a phone each item is a card with the name, the
   photo if that column is on, the category, and every other chosen field as a labelled line (empty
   ones are left out), plus the same two buttons. Phones sort with the **Sort** box above the list,
   which offers the visible sortable columns, and the arrow button beside it, which reverses the
   order. The location shown is the inherited one for items that sit inside a container. While the
   **Transferred To** column is hidden, an item with a transfer shows a **Transferred to: …** badge
   under its name. The checkbox in front of each item selects it for label printing.
7. The list shows 12 items per page; use **Previous** and **Next** below the results. The total count
   is shown under the **Items** heading.

### Record where an item was transferred

1. Open the item's form (**Add item** or **Edit**).
2. Type the person or destination into **Transferred To**, for example `Vasyl`, `Father`, or
   `Sold via OLX`. Clicking into the field lists values already used on other items, most used first;
   choose one the same way as a custom-field suggestion, or type a new value. At most 255 characters.
3. Press **Save item**. The item page shows a **Transferred to: …** badge under the item name, and the
   **Items** list shows the same badge with the item.
4. To remove the note, clear **Transferred To** and save. The badge disappears.

The field is only a note: it does not change **Location**, **Stored inside**, or anything else. Every
change of it is listed in the item's **History** as *Transferred To changed*, but it never starts or
ends a loan; use **Transfer** for that (see the next section). Search for the value on **Items** to
list everything transferred to the same person.

### Lend an item and mark it as returned

1. Open the item and press **Transfer** next to **Edit**.
2. Enter the **Recipient** (suggestions come from earlier Transferred To values). **Transferred on**
   is now unless you change it; it cannot be in the future. **Expected return** and **Note** are
   optional. Press **Transfer**.
3. The item page shows a **Loan** card: *On loan to …*, since when, the expected return, the note,
   and an **Overdue** badge once the expected return day has passed. **Transferred To** now holds the
   recipient, so the badge and the Items search work as before. **Location** and **Stored inside**
   do not change.
4. When the item is back, press **Mark as returned** on the **Loan** card, adjust **Returned on** if
   it came back earlier, add a note if you like, and press **Mark as returned**. The loan is closed,
   **Transferred To** is cleared (unless you had changed it by hand to someone else), and **History**
   shows how long the loan lasted.

An item has at most one open loan, so **Transfer** is hidden while one is open. A new loan cannot
start before the previous one was returned. Loans are history, so they cannot be edited or deleted;
to correct a mistaken loan, mark it as returned with a note. Selling or giving an item away is not a
loan: retire the item instead.

### See the history of an item

The item page has a **History** card with the five most recent changes; **View full history** opens
all of them, newest first, with **All**, **Locations**, **Transfers**, and **Lifecycle** filters and
**Load more**.
History is recorded by the server when a change is saved, from the moment History was installed;
nothing earlier is invented.

- **Location changed** — the location you see for the item changed, from → to. This includes moves
  of a container it is in, at any depth: such entries say *Moved together with …*, linking to the
  container that moved. Editing the own saved location of an item that shows its container's location
  is not a move, because what you see stays the same; neither are changes of letter case or spaces.
- **Container changed** — **Stored inside** changed, from → to, even when the location stays the same.
  The items inside it keep their container, so they get no entry unless their location changed.
- **Transferred To changed**, **Lent to …**, **Returned from …** — the recipient note and the loans
  of the previous section, with their dates, notes, and the actual duration of returned loans.
- **Retired: …** and **Restored to inventory** — the reason, the last location, and the container the
  item was taken out of, or the location and container it came back to. Items retired or restored
  with their container say *Retired together with …* or *Restored together with …*.

Changes saved together, such as a new container and the location it brings, are one entry. **Bulk
move** and **Bulk replace** entries come from **Move to…** and **Replace a field value on many items**
(Location and Transferred To only). Other edits — name, Condition, photos, fields — are not History.
Entries keep the names and locations as they were, so they stay readable after renames; a container
deleted since then is marked *(deleted)*. Deleting an item permanently deletes its own history.

### Put an item inside another item

1. Open the item's form (**Add item** or **Edit**).
2. In **Stored inside**, type part of the container's name into
   *Search an item to store this one in…* and press **Search** or Enter.
3. Click the result you want. It appears as a badge above the search box.
4. Press **Clear** next to the badge to take the item out of its container and make it top-level
   again. The form then asks *Where is this item now?*: choose where it was (the container's
   location), its own saved location (if it differs), **Another location** (then type it in
   **Location**), or **No location**. Saving is not possible until you choose, so an old saved
   location never silently becomes the item's place.
5. Save. The item page now shows a **Storage** card with **Stored inside** linking to the container,
   and the container's page lists the item under **Contents**. **Location** on the item page now
   shows the container's location with a short note that it is inherited.

Nesting can go several levels deep. An item cannot be placed inside itself or inside anything it
already contains; the server rejects such a move with an error message.

### Move several items into a container at once

1. Open **Items** and tick the items to move, as for label printing: the checkbox in front of each
   row or card, or the table header checkbox for the whole page. On a phone, **Select all items on
   this page** in the bar above the cards does the same. The selection is kept while you page,
   search, and filter.
2. Press **Move to…** in that bar. It is disabled while nothing is selected.
3. In **Move selected items**, type part of the destination's name under **Destination**. Each result
   shows its category and, when it is inside something, the container it is in. Items that are
   selected or stored inside the selection are never offered.
4. Choose the destination. The dialog asks *Move the selected items into "…"?*; press **Move**.
5. The list reloads with the new **Stored inside** and inherited **Location**, and a message says how
   many selected items are now inside the destination. The selection is cleared.

If you select a container together with things inside it, the structure is kept: only the outermost
selected items go into the destination, and everything else stays in its selected container. For
example, selecting `Box A` and the `Camera` inside it and moving them to `Box B` gives
`Box B → Box A → Camera`. The dialog says how many top-level selected groups will be moved whenever
that differs from the number of selected items.

The move is all or nothing. If a selected item was deleted in the meantime, or the destination is now
inside the selection, an error appears in the dialog, nothing is moved, and the selection stays so you
can pick another destination. Items that are already directly inside the destination stay as they
are. Saved locations and all other item details are never changed; the displayed location follows
the new container. There is no undo, and **Move to…** cannot take items out to the top level — use
**Stored inside** → **Clear** in the item form for that.

### Browse the storage hierarchy

1. Open **Hierarchy** in the navigation. On a phone it is in the **☰** menu.
2. The tree starts at **Inventory**. Under it are your locations, each with a pin and the number of
   items stored there, followed by **No location** for everything without one. An item is listed
   under its displayed location — the location of its outermost container — so a box and everything
   inside it always stay together. Spellings that differ only in spaces or capitals, such as
   `Garage` and `garage`, are one location; your saved text is not changed.
3. Inside a location come its top-level containers — items that are not inside anything but hold
   something — followed by that location's own **Uncontained items** group for every top-level item
   there that holds nothing. The group shows how many items it has.
4. Press the arrow in front of a row to open or close it. Item rows show the photo, name, category,
   displayed location, and how many items are directly inside. **Expand all** and **Collapse all**
   open or close every location, group, and branch at once.
5. Click an item name to open that item's page. Locations are only groups, not records.
6. Type into **Search hierarchy** to find items or locations by name. Each matching item is shown
   inside its location and containers, which open automatically, for example
   `KP Garage → Box A → Camera Bag → Nikon F80`. A matching location opens to show its containers
   and group. Clear the search to get back to the branches you had open.
7. Choose **Graph** next to the search to see the same hierarchy as a diagram that grows from
   **Inventory** on the left, through the locations, to the contents on the right; **Tree** switches
   back. Locations have a blue border and a pin, containers a coloured left edge, and arrows point
   from a location or container to what is inside it.
   - Drag the background to move around and scroll (or pinch on a touch screen) to zoom. The
     buttons above the graph zoom in, zoom out, and **Fit to view**.
   - Press **+** or **−** on a node to open or close it; **Expand all** and **Collapse all** work as
     in the tree, and the branches you open stay open when you switch views.
   - Click a name, or double-click an item node, to open that item's page. **Back** returns to the
     graph.
   - A search highlights the matching items and locations and zooms to them and their containers.
   - The graph draws at most 500 items at once. If more are open, it asks you to collapse some
     branches, search, or use the tree instead.
8. Choose **Category** under **Group by** to see what you own of each kind instead of where it is;
   **Location** switches back. **Group by** and **View** are separate, so both **Tree** and **Graph**
   work with either grouping, and **Back** from an item returns to the same combination.
   - Under **Inventory** is every category with items, with a tag icon and the number of items in
     it, wherever they are stored.
   - An item stays under its container only when both are in the same category, for example a PC
     with its motherboard, or a camera with a lens of the same category. Anything whose direct
     container is in another category is listed straight under its own category, so a camera in a
     storage box appears under Photography and the box under its own category — never both, and
     never with the box inside Photography. An item inside a bag inside a camera is not shown under
     the camera either, because the bag is in between.
   - Item rows show the displayed location and, when the container is not the row above, *Stored
     inside: &lt;container&gt;*. The item count of a row counts only the same-category items under it.
   - **Search hierarchy** finds item and category names here; a match opens its category and its
     same-category containers. There are no **Uncontained items** groups in this grouping.
   - Each grouping remembers the branches you opened in it while the page stays open.
9. **Inventory** shows **Active** items by default; choose **Retired** or **All** to include retired
   items, in either grouping and view. A retired container is always shown with everything retired
   inside it, and retired items have **Retired** in their secondary line.

The tree and graph only show what is stored where; to move an item, change **Stored inside** in its
form, or use **Move to…** on **Items** for several items at once; to move something to another
location, change the **Location** of the item or of its outermost container; to change a category,
edit the item. Nodes cannot be dragged. **Inventory**, the locations, the categories, **No
location**, and **Uncontained items** are only views, not records.

### Use custom-field autocomplete

1. In the item form, click into any **Text** custom field.
2. Values already saved for that exact field appear, most used first.
3. Keep typing to filter them; matching is case-insensitive and matches from the start of the value.
4. Choose one with the mouse, or with `ArrowDown`/`ArrowUp` and `Enter`. `Escape` closes the list and
   `Tab` leaves the field without choosing anything.
5. You can always type a completely new value. Once saved, it is suggested the next time.

### Replace a field value on many items

Use this to fix inconsistent naming without editing items one by one, for example to rename the
location `Garage` to `KP Garage` everywhere.

1. Open **Data / Backup** and find **Replace field value**.
2. Choose the **Field**: **Condition Notes**, **Location**, or **Transferred To** change that value on items
   of every category. For a text custom field choose **Custom text field…**, then the **Category**;
   **Custom field** then lists only that category's text fields and starts at the first one. Only
   that one field is changed; a field with the same name in another category is left alone.
3. Click into **Current value** to see the values saved for that field with how many items use each,
   and choose one or type it. Enter the replacement in **New value**; it offers the same values.
4. Press **Preview changes**. Nothing is saved yet. The preview shows the field, both values, the
   number of items that will change, and a table of those items with their category and saved value
   (the first 100 when there are more). If the new value is already used, a note says by how many
   items. If no item has the current value, the preview says so and the replace button stays
   disabled.
5. Press **Replace in N items** to apply it, or **Cancel**. Changing the field or either value hides
   the preview, so it always matches what you confirm. The message afterwards reports how many items
   were actually changed: items edited in the meantime are checked again when you confirm.

Only whole values are replaced. Letter case and spaces at the start or end are ignored when values
are compared, so `Garage`, ` garage `, and `GARAGE` all match `Garage`, but `TP Garage` and
`Big Garage` never do. **Location** changes only the location saved on each item: items stored inside
a container are not rewritten and keep showing the container's new location automatically. Name,
description, serial number, dates, numbers, yes/no fields, **Stored inside**, and **Category** cannot
be replaced this way; rename a category on **Categories & Fields**. There is no undo, so download a
backup first when in doubt.

### Switch between light and dark mode

1. Press the sun button for light mode or the moon button for dark mode. On phones and narrow
   tablets they are always in the top bar; on a wide screen expand the sidebar first (hover it or
   move keyboard focus into it) to reach them at its bottom.
2. The choice applies immediately, on every page, and is stored in this browser only. It changes
   nothing on the server, so each browser and device can use a different mode.
3. Until you press one of them, the application follows your operating system's colour scheme.

### Find a setting

**Settings** opens as a dialog over the page you are on, which stays as you left it underneath. It is
split into sections: **Interface** under *General*, **Database** and **Cloud Backup** under *Data*,
and **AI** under *Services*. On a computer the sections are listed on the left of the dialog and the
open one is highlighted; on a phone Settings fills the screen and you choose the section from the
**Section** selector at the top. A long section scrolls inside the dialog.

Close Settings with the **×** button, `Esc`, a click beside the dialog, or the browser's Back button:
you return to the same page with its search, filters, and scroll position. Switching sections does not
add Back steps. If a section has changes you have not saved, Settings asks before it closes, switches
sections, or goes elsewhere; choose **Cancel** to keep editing.

Each section has its own address, such as `/settings/ai`, so it can be bookmarked or reloaded;
`/settings` opens **Interface**. An address opened directly, after a reload, or on the return from a
Dropbox or Google Drive sign-in shows Settings over the **Dashboard**, where closing it leaves you.

### Change the interface language

1. Open **Settings**. It opens on the **Interface** section, which holds the **Language** selector.
2. Choose **English** or **Українська**. Every page, the navigation, and open dialogs switch at once;
   no reload is needed.
3. The choice is stored in this browser only and survives a reload. Other browsers and devices keep
   their own language, and a browser without a choice uses English.
4. Dates, numbers, prices, and file sizes follow the chosen language, for example `Nov 18, 2024` and
   `$49.99` in English, `18 лист. 2024 р.` and `49,99 USD` in Ukrainian. The stored values do not
   change.
5. Only the interface is translated. Item, category, and field names, descriptions, locations, and
   every other value you entered are shown exactly as saved; changing the language never changes,
   replaces, or resets your inventory. (Only the public demo, whose invented sample inventory exists in
   both languages, reloads it in the new language.) Error messages, such as a refused
   deletion or an invalid backup file, follow the chosen language too; the release notes in
   **Version History** and **What's New** stay in English.

### Name the database

1. Open **Settings → Database**. The card shows the **Database name** (`Inventory Atlas` until you
   change it) and when the inventory was **Last updated**.
2. Type a name such as `Home Inventory` or `Garage` and press **Save name**. The card reports
   `Database name saved.` A name cannot be empty, longer than 100 characters, or contain line breaks.
3. **Last updated** moves whenever something in the inventory is saved: items, photos, categories,
   custom fields, templates, imports, and bulk replacements. Browsing, searching, and opening pages do
   not change it.
4. **Technical details** shows when the database was **Created**, its **Database UUID**, and its
   **Schema version**. These are managed by the application and cannot be edited.

The name and these details are stored inside the database file, so a backup carries them and a
restore brings them back. A reset starts a new database with a new UUID and the default name.

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

1. Open **Settings → Cloud Backup**. On a card marked **Not configured**, enter the
   app key and app secret (Dropbox) or the client ID and client secret (Google Drive) under
   **App credentials** and press **Save app credentials**. The secret stays on the server: afterwards
   the form only shows its last four characters, and leaving the field blank keeps it. **Remove**
   deletes the saved credentials; disconnect the provider first. An operator can instead set
   `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET` or `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` on the server;
   those then take precedence and are shown read-only.
2. Press **Connect Dropbox** or **Connect Google Drive**, sign in, and allow access. You return to
   **Settings → Cloud Backup** with `Dropbox connected.` (or the reason it failed), and the card shows the account and the
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
   categories, items, custom fields, values, photos, templates, checklists, and checklist runs the backup contains. If these numbers do not
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
saved value, item template, checklist, and checklist run — and leaves an empty database, as on a fresh installation. Application settings,
such as the AI settings and the API key, and all existing backups are kept.

1. Download a backup first if you might want the data again.
2. Open **Data / Backup** and scroll to the red **Danger Zone** at the bottom of the page.
3. Press **Reset Inventory Database**. The dialog asks the server for the current numbers and lists
   how many items, categories, custom fields, custom field values, photos, item templates, checklists,
   and checklist runs will be removed.
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

### What's New after an update

The first time you open the application after it was updated, a **What's New** dialog says which
version you now run and lists the changes of every release since the version you last used in this
browser, newest first — skipped releases included.

- Close it with **Got it**, the **×**, `Escape`, or a click outside it. Any of them marks the version
  as seen, so the dialog does not come back until the next update.
- **View full changelog** closes it and opens **Version History** over the About dialog.
- A new installation, a new browser, or a browser that blocks site storage shows no dialog, and
  neither does a downgrade to an older version. The seen version is remembered per browser, so each
  browser or device shows the dialog once on its own.

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
items, categories, custom fields, values, nesting, templates, checklists with their run history, the
original photo bytes, and the
database name and identity shown under **Settings → Database**. There are no separate image files to
back up.

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
- Search covers the item name, description, serial number, and Transferred To. **Hierarchy** searches
  item names and location or category names only, depending on **Group by**.
- **Hierarchy** is read-only: items cannot be moved or dragged in the tree or the graph. **Move to…**
  on **Items** only places items inside a container; it cannot move them to the top level and has no
  undo. The graph
  draws at most 500 visible items at once and is easiest to use on a larger screen; the tree is the
  default view.
- **Replace field value** replaces one exact value of one field at a time. There is no substring or
  pattern replacement and no undo.
- A category used by any item cannot be deleted, and an item containing other items cannot be
  deleted.
- Checklists only reference existing items: there are no free-text entries, no QR or barcode
  scanning inside a run, no reminders or schedules, and checking an item or auditing a container never
  changes its location, container, or any other item data except **Last verified**. A completed run
  cannot be edited or deleted; run it again instead.
- Deleting a custom field also deletes the values saved for it on every item of that category.
- Custom field types cannot be changed after creation, a field cannot move to another category, and
  categories cannot be merged. Fields are renamed one at a time on **Categories & Fields**; the batch
  editor only creates new fields and never renames or retypes existing ones.
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
- The interface, including error messages, is available in English and Ukrainian only. The release
  notes in **Version History** are shown in English in both languages.
- Autocomplete is offered for text custom fields and **Transferred To** only, not for the name,
  condition notes, location, or description.
- **Condition** uses one fixed scale for every category; there are no custom scales or half grades,
  and the grade cannot be changed in bulk. Bulk Replace Value changes Condition Notes only.
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
| AI Add Item is missing | AI features are off. Open **Settings → AI**, choose a provider, enter its API key if it needs one, choose a model, tick **Enable AI features**, then save. The AI actions appear immediately. |
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
