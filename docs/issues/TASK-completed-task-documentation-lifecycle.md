# CODEX TASK — Clean Up Completed Task Files and Add a Feature Documentation Index

## Goal

Introduce a clear lifecycle for implementation task files in **Inventory Atlas Lite**:

1. task specification files are temporary working documents;
2. after a task is fully implemented and verified, its task file is removed;
3. the implemented result is documented as a concise permanent feature document;
4. a README inside the implemented-features directory acts as a table of contents for all completed features;
5. `AGENTS.md` permanently instructs future coding agents to follow this workflow.

Also perform an initial cleanup of task files that have already been completed.

The purpose is to keep the repository free of stale completed task specifications while preserving a useful, navigable record of what the application actually supports.

---

## First inspect the repository

Before changing files:

1. inspect the complete repository structure;
2. locate all task/specification files, including files matching patterns such as:
   - `CODEX-TASK-*.md`;
   - `TASK-*.md`;
   - other clearly temporary implementation task documents;
3. locate the existing directory, if any, that already contains descriptions of implemented features;
4. inspect `AGENTS.md` and preserve all existing project, commit, and push rules;
5. inspect the code, tests, and documentation to determine which tasks are genuinely complete.

If the repository already has a canonical directory for implemented feature documents, keep using it. Do not create a competing documentation hierarchy.

If no such directory exists, create:

```text
docs/features/
```

The requirements below use `docs/features/` as the default name. Adapt the path consistently if the repository already uses another clear canonical location.

---

## Initial cleanup of existing task files

Review every existing task file individually.

A task file may be removed only when all of the following are true:

- its requested behaviour exists in the current codebase;
- its relevant acceptance criteria are satisfied;
- relevant automated tests pass, or the feature has otherwise been verified where automation is impractical;
- no unfinished requirement from the task remains;
- a permanent feature document exists or is created as part of this cleanup;
- the feature index links to that permanent document.

Do not assume that a task is complete merely because its file is old or because some related code exists.

For each task:

- **Completed:** create or update the corresponding feature document, update the feature index, then delete the task file.
- **Partially completed or uncertain:** keep the task file and clearly report what prevents it from being considered complete.
- **Not started:** keep the task file unchanged.
- **Duplicate task for an already documented feature:** merge any still-useful factual information into the canonical feature document, then remove the duplicate only after verifying completion.

Do not delete unrelated design documents, architecture documents, roadmaps, review documents, ADRs, or user-facing documentation. Only remove temporary task specifications that are demonstrably complete.

Use normal tracked file deletion so Git history retains the original task contents. Do not rewrite Git history.

---

## Permanent implemented-feature documents

Each completed substantial feature must have one concise permanent Markdown document in the canonical implemented-features directory.

Recommended naming:

```text
docs/features/
├── README.md
├── nested-items.md
├── custom-field-autocomplete.md
└── proxmox-one-line-installer.md
```

Use stable, descriptive, kebab-case filenames. Do not include temporary prefixes such as `CODEX-TASK-` in permanent feature documentation.

If one existing feature document already covers the completed task, update that document rather than creating a duplicate.

### Required content

Each feature document should describe the implemented reality, not repeat the original task verbatim.

Include:

```markdown
# Feature name

## Summary

Short explanation of what the feature does and why it exists.

## User-visible behaviour

What the user can do and any important limitations.

## Implementation overview

Concise description of the relevant data model, API, UI, deployment, or service behaviour.

## Verification

Relevant automated tests and/or manual verification performed.

## Notes and limitations

Important operational, compatibility, security, migration, or non-goal information.
```

Sections may be adjusted when they do not apply, but every document must at least provide:

- a clear summary;
- current user-visible behaviour;
- a concise implementation overview;
- verification status;
- relevant limitations.

Requirements:

- Document only functionality that actually exists in the current codebase.
- Use present tense for implemented behaviour.
- Do not preserve speculative requirements as if they were implemented.
- Do not copy hundreds of lines of acceptance criteria from the deleted task.
- Keep enough technical detail for a future developer or coding agent to understand the feature boundaries.
- Link to other repository documents using relative Markdown links.
- Do not invent release versions, dates, commit hashes, or test results.

Small fixes that merely repair an existing documented feature should update that feature's document when the fix changes its behaviour or limitations. They do not require a new standalone feature document.

---

## Feature directory README

Create or update:

```text
docs/features/README.md
```

This file is the canonical table of contents for implemented features. A developer or coding agent must be able to open it and navigate to every permanent feature document without manually browsing the directory.

Use a compact structure such as:

```markdown
# Implemented Features

This directory documents functionality that is implemented and verified in Inventory Atlas Lite.

| Feature | Summary |
| --- | --- |
| [Nested items](nested-items.md) | Store items inside other items and browse direct contents. |
| [Custom-field autocomplete](custom-field-autocomplete.md) | Suggest previously used values for text custom fields. |
```

Requirements:

- include every implemented feature document in the directory;
- use relative links that work on GitHub;
- use human-readable feature names and one-sentence summaries;
- do not link deleted task files;
- do not list unfinished tasks as implemented features;
- avoid duplicate entries;
- keep the index updated whenever feature documents are added, renamed, or removed.

Order entries consistently. Prefer logical product grouping; if no grouping is useful, use alphabetical order.

Add a short link from the repository root `README.md` to the implemented-features index, preferably in an existing Documentation section. Do not turn the root README into a duplicate feature catalog.

---

## Update `AGENTS.md`

Add a concise mandatory rule describing the task-document lifecycle. Preserve all existing instructions, especially existing commit and push restrictions.

The rule must communicate the following behaviour:

### Task files are temporary

- Files such as `CODEX-TASK-*.md` are active implementation specifications, not permanent completion records.
- Keep a task file while any requirement remains incomplete or unverified.

### When a task becomes complete

Before considering a feature task finished, the agent must:

1. implement the requested behaviour;
2. run the relevant tests and verification;
3. create or update its permanent feature document in the canonical implemented-features directory;
4. add or update the corresponding entry in `docs/features/README.md` or the repository's existing equivalent index;
5. delete the completed task file;
6. include the documentation update, index update, and task-file deletion in the same logical change/commit as the completed feature whenever practical.

### Safety rules

- Never delete an incomplete, partially implemented, failed, blocked, or uncertain task.
- Never mark a feature as implemented based only on the task text; verify it against code and tests.
- Permanent feature documentation describes the resulting implementation, not the original plan.
- If a task modifies an existing documented feature, update that feature document instead of creating duplicate documentation.
- If an agent is not authorized to commit, it must still prepare the complete working-tree change and report the files ready for commit.
- Existing project rules about whether commits are allowed and whether pushing requires explicit user approval remain authoritative.

Keep this addition short enough to be useful as an operating instruction. Do not paste this entire task specification into `AGENTS.md`.

---

## Recommended workflow for future tasks

The resulting repository workflow should be:

```text
Active request
    ↓
Temporary CODEX-TASK-*.md exists
    ↓
Feature is implemented and tested
    ↓
Permanent docs/features/<feature>.md is created or updated
    ↓
docs/features/README.md index is updated
    ↓
Completed task file is deleted
```

At no point should an unfinished task disappear from the repository.

---

## Verification

After the cleanup:

1. run all existing automated tests;
2. run the production build;
3. verify every link in the feature index points to an existing file;
4. verify the root README link to the feature index works;
5. verify no completed task file remains after its feature documentation has been created;
6. verify every retained task file is still active, partial, blocked, or uncertain;
7. verify no implemented feature document claims behaviour absent from the code;
8. verify `AGENTS.md` retains all pre-existing commit/push and project-specific rules;
9. inspect `git diff --stat` and `git status` to ensure unrelated files were not removed.

If practical, add a small documentation consistency check that fails when `docs/features/README.md` contains a broken relative link. Do not introduce a large documentation framework solely for this check.

---

## Deliverable report

At the end, report:

- task files deleted as completed;
- task files retained and why;
- permanent feature documents created or updated;
- index and root README changes;
- exact `AGENTS.md` rule added;
- tests/build commands run and their results;
- any feature whose completion could not be verified.

Do not claim that all tasks were cleaned up if uncertain or incomplete task files remain.

---

## Non-goals

Do not:

- implement unfinished product features merely to make every task file removable unless separately requested;
- delete roadmaps, ADRs, design documents, reviews, or architecture specifications;
- create a second competing feature-document directory;
- copy complete task specifications into permanent feature documents;
- list planned features as implemented;
- create a database or external service for documentation tracking;
- add a documentation site generator;
- rewrite Git history;
- commit or push unless allowed by the existing `AGENTS.md` rules and the user's authorization.

---

## Acceptance criteria

The task is complete when:

1. every existing task file has been individually classified as completed, partial, blocked, uncertain, or not started;
2. every verified completed task has a concise permanent implemented-feature document;
3. completed task files are removed only after their permanent documentation exists;
4. incomplete or uncertain task files remain available;
5. the implemented-features directory contains a `README.md` linking to every feature document;
6. the repository root README links to the implemented-features index;
7. `AGENTS.md` requires future agents to document completed features, update the index, and delete completed task files;
8. all index links work;
9. existing tests and the production build pass;
10. no unrelated documentation or source files are deleted;
11. the final report clearly lists deleted and retained task files with reasons.

## Main priority

Create a trustworthy distinction between **active work** and **implemented functionality**:

- task files describe work that still needs attention;
- feature documents describe behaviour that actually exists;
- the feature README provides one reliable entry point for navigating completed work.
