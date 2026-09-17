# CODEX TASK — Create a User How-To Guide and Keep It Current

## Goal

Create a concise, practical user guide for **Inventory Atlas Lite** that describes the application's current state and explains how to use all implemented user-facing features through basic real-world workflows.

The guide is intended for a person who has already installed or deployed the project and now wants a quick answer to:

- What can the application currently do?
- What should I configure first?
- How do I add and organize my inventory?
- How do I find, edit, move, and back up items?
- What important limitations should I know about?

After creating the guide, update `AGENTS.md` so every future user-facing feature or behaviour change must update this documentation as part of the same task.

---

## First inspect the actual project

Before writing documentation:

1. inspect the current source code, routes, UI screens, database behaviour, and tests;
2. inspect the root `README.md` and all existing documentation;
3. inspect the implemented-feature documentation and its index, if present;
4. identify every user-facing feature that is actually implemented;
5. verify the real labels, navigation names, buttons, fields, supported formats, limits, defaults, and restrictions;
6. run or inspect the application when practical to confirm the main workflows;
7. inspect `AGENTS.md` and preserve all existing project, commit, push, and documentation rules.

Do not treat old task specifications or planned features as evidence that functionality exists. The guide must describe the current working application, not the roadmap.

If documentation and code disagree, use verified current behaviour as the source of truth and report the discrepancy.

---

## Documentation file

Create:

```text
docs/HOW-TO.md
```

If the repository already has a clearly established user-guide directory or equivalent canonical filename, use that location instead and update all links consistently. Do not create duplicate competing guides.

The guide must be written in clear English, consistent with the project's existing documentation language.

Use a user-facing title such as:

```markdown
# Inventory Atlas Lite — Quick How-To
```

This is a compact operational guide, not an architecture document, API reference, product roadmap, or copy of the README.

---

## Required guide structure

Adapt headings to the actual application, but cover the following content.

### 1. What Inventory Atlas Lite does

Briefly explain:

- the purpose of the application;
- that it is a lightweight self-hosted personal inventory;
- what kinds of objects it can catalog;
- where data and photos are stored at a high level;
- the current trust/security model, including the absence of authentication if that remains true.

Keep this section short.

### 2. Before you start

Explain only what a deployed user needs to know:

- how to open the application URL;
- that the application should normally be accessed from a trusted LAN or VPN;
- any browser/runtime assumptions relevant to using the UI;
- any important first-run state, such as an empty database.

Link to the existing installation/deployment documentation instead of duplicating all installation commands.

### 3. Recommended first setup

Provide a short ordered path that gets a new user from an empty installation to a useful inventory.

For example, if supported by the current application:

1. create categories;
2. add category-specific custom fields;
3. create the first item;
4. attach photos;
5. assign a location or parent/container;
6. confirm the item can be found through search/filtering;
7. create the first backup.

Use the actual navigation names and controls from the current UI.

### 4. Core concepts

Explain the minimum vocabulary required to use the application, such as:

- items;
- categories;
- custom fields and their supported types;
- plain-text location;
- nested items or containers, if implemented;
- photos;
- SQLite backup.

Clearly explain distinctions that could confuse a user. For example, if both a plain-text `Location` and `Stored inside` relationship exist, explain what each represents and how they can work together.

Do not document concepts that exist only in the larger Inventory Atlas project or roadmap.

### 5. Basic use cases

Write short step-by-step workflows using concrete examples. Include every workflow supported by the current application and omit unsupported ones.

At minimum, assess and document:

- creating and editing a category;
- adding and managing custom fields;
- creating an item;
- editing and deleting an item;
- adding, viewing, and removing photos;
- searching, filtering, sorting, and paging through items;
- placing an item inside another item, browsing contents, moving it, and removing it from a container, if nested items are implemented;
- using custom-field autocomplete, if implemented;
- downloading a portable database backup;
- restarting or updating a self-hosted instance only when the project already exposes and supports those workflows.

Each workflow should:

- begin with the relevant page or navigation action;
- use the exact visible control names where practical;
- contain only the steps needed to complete the task;
- mention validation or deletion restrictions that the user may encounter;
- explain the visible result.

Prefer numbered steps over long paragraphs.

### 6. Practical example

Include one end-to-end example relevant to the product, such as:

```text
Garage
└── Box A
    ├── Helios 44-2 lens
    └── Olympus camera
```

Show how a user would represent this arrangement using the actual implemented fields and relationships.

Keep the example small and consistent with the application's real capabilities.

### 7. Backup and data safety

Explain:

- how to download an application-level backup;
- what the downloaded file contains;
- that photos are included only if this is true in the current implementation;
- where persistent data lives for supported self-hosted deployments, if documented by the project;
- the difference between a portable application backup and a full LXC/server backup;
- how often a personal homelab user should consider creating backups.

Do not document a restore button or automatic restore workflow unless one actually exists. If restore is currently manual or not supported through the UI, state that plainly and link to any existing authoritative restore instructions.

### 8. Limitations and security

List only important current limitations, for example:

- no authentication or multi-user permissions;
- intended for a trusted LAN/VPN;
- no direct public Internet exposure;
- supported photo formats and size/count limits;
- deletion restrictions for used categories or non-empty containers;
- missing restore UI;
- other verified product constraints.

This should help users avoid mistakes, not become a roadmap of everything the product lacks.

### 9. Quick troubleshooting

Include a very small troubleshooting section covering only common actionable cases supported by current project knowledge, such as:

- the page does not open;
- the service is not running;
- an item/category/container cannot be deleted;
- photo upload is rejected;
- search returns no results;
- where to check service logs in the supported deployment.

Link to existing deployment documentation for advanced server diagnostics.

---

## Writing requirements

The finished guide must be:

- concise enough to read quickly after deployment;
- complete enough to cover all current user-facing features;
- task-oriented rather than implementation-oriented;
- understandable without reading source code;
- written in plain English;
- formatted cleanly for GitHub Markdown;
- based on verified current behaviour.

Use:

- short sections;
- numbered steps for workflows;
- small tables only when they improve scanning;
- relative links to related repository documentation;
- concrete examples.

Avoid:

- long internal architecture explanations;
- SQL schema details unless a user genuinely needs them for data safety;
- source-file listings;
- API endpoint catalogs;
- speculative future features;
- copied task acceptance criteria;
- claims that were not verified;
- decorative filler or marketing language.

Do not add screenshots as a requirement. Existing accurate screenshots may be referenced if already maintained, but the guide must remain useful without them.

---

## Documentation links

Update the root `README.md` with a visible link to the new guide, preferably in the existing Documentation or Usage section:

```markdown
- [Quick How-To](docs/HOW-TO.md) — basic setup and common inventory workflows.
```

If `docs/features/README.md` or an equivalent implemented-feature index exists, add an appropriate link between the two documents without duplicating their purposes:

- `HOW-TO.md` explains how a user operates the product;
- the implemented-feature documents explain individual feature boundaries and implementation details;
- the root README provides the high-level project entry point.

Check every relative link after editing.

---

## Update `AGENTS.md`

Add a concise mandatory documentation-maintenance rule. Preserve all existing instructions and do not weaken any commit or push restrictions.

The rule must state that:

1. `docs/HOW-TO.md` is the canonical quick user guide for the current application;
2. every new user-facing feature must update the guide before the task is considered complete;
3. any change to navigation, labels, workflows, validation, limits, backup behaviour, security assumptions, or visible limitations must update the affected guide section;
4. removed or renamed features must be removed or renamed in the guide in the same change;
5. the agent must verify instructions against actual working behaviour and must not document planned functionality as implemented;
6. when a feature task also creates or updates a permanent implemented-feature document, the HOW-TO update is an additional required step, not a replacement;
7. documentation updates should be included in the same logical change/commit as the feature whenever practical;
8. a task is not complete if its user-facing documentation is knowingly stale.

Keep the addition to `AGENTS.md` short and operational. Do not paste this complete specification into it.

The rule should apply only when a change affects users or operators. Pure internal refactoring with no observable behaviour change does not require meaningless HOW-TO edits.

---

## Verification

After creating the guide:

1. run the application or inspect verified tests/routes to confirm every documented workflow;
2. verify that every currently implemented user-facing feature is either explained directly or intentionally linked to authoritative documentation;
3. verify that no planned or unfinished feature is presented as available;
4. verify all relative Markdown links;
5. verify visible labels and navigation names match the UI;
6. verify limits such as photo formats, file size, item count per upload, and pagination only when explicitly documented;
7. run all existing automated tests;
8. run the production build;
9. verify `AGENTS.md` retains its previous rules;
10. inspect the final diff for unrelated changes.

If the application cannot be run in the available environment, clearly identify which instructions were verified from code/tests and which still require a manual UI check. Do not claim manual verification that did not occur.

---

## Deliverable report

At completion, report:

- the path of the new HOW-TO guide;
- the user workflows documented;
- the README links added or updated;
- the exact documentation-maintenance rule added to `AGENTS.md`;
- tests and build commands run with results;
- any behaviour that could not be verified;
- any existing documentation contradiction corrected or reported.

---

## Non-goals

Do not:

- implement new product features as part of writing the guide;
- document features from the larger Inventory Atlas project unless they exist in Inventory Atlas Lite;
- turn the guide into an API reference or architecture document;
- duplicate installation instructions already maintained elsewhere;
- create a documentation site generator;
- introduce a new UI help system;
- add authentication, restore functionality, deployment tooling, or screenshots solely for this task;
- rewrite historical documents;
- commit or push unless allowed by the existing `AGENTS.md` rules and user authorization.

---

## Acceptance criteria

The task is complete when:

1. one canonical quick user guide exists at `docs/HOW-TO.md` or the repository's established equivalent;
2. it accurately summarizes the current application and its user-facing features;
3. a newly deployed user can follow it from first setup through normal inventory use and backup;
4. all documented workflows match current UI behaviour;
5. unsupported or planned features are not described as available;
6. the guide clearly states important security and operational limitations;
7. the root README links to the guide;
8. related documentation indexes link appropriately without duplicating content;
9. `AGENTS.md` requires future user-facing changes to update the guide;
10. existing tests and the production build pass;
11. all documentation links work;
12. the final report identifies any workflow that could not be verified.

## Main priority

Create a short, trustworthy manual that answers: **“I have deployed Inventory Atlas Lite—what can it do, and how do I use it?”** Then make keeping that answer current a permanent part of the repository's agent workflow.
