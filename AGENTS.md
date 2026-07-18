# auto-crash — Agent Guide

This file is the persistent memory for AI agents working in this repo. Read it at
the start of every task, and keep it up to date as described in the loop below.

## Living Documentation Loop (ALWAYS follow)

On **every** prompt, before finishing your turn, run this check:

1. **Detect new knowledge.** Ask yourself: did this prompt introduce or change any
   of the following?
   - A new rule, convention, or constraint the user wants followed.
   - A change to an existing rule (the user corrected or updated something).
   - A design/architecture decision (e.g. "this section will be built like X").
   - A structural choice about how the project is organized (folders, modules,
     naming, tech stack, data flow, etc.).
   - Any reasoning or "sense of logic" a future agent would need to stay consistent.

2. **Sync the docs.** If any of the above is true, update the relevant `.md`
   file(s) in the same turn as you make the code change — do not defer it:
   - Project-wide rules, conventions, and decisions → this `AGENTS.md`.
   - Detailed design notes for a specific area → the section's own doc under
     `docs/` (create it if it doesn't exist) and link it from the
     [Architecture & Decisions](#architecture--decisions) section below.
   - User-facing usage/setup info → `README.md`.

3. **Keep it consistent.** If a new instruction contradicts something already
   written here, update the old entry instead of appending a duplicate, and note
   what changed. The `.md` files must always reflect the current intended state
   of the project.

4. **Record the "why", not just the "what".** When you capture a decision, include
   the reasoning behind it so future agents follow the same logic rather than
   re-deriving (or breaking) it.

> Rule of thumb: if a future agent could get the project wrong by *not* knowing
> something the user just told you, write it down here.

## Project Overview

<!-- Keep this current. What auto-crash is, its purpose, and its high-level shape. -->
- _TBD — fill in as the project takes shape._

## Conventions & Rules

<!-- Coding standards, naming, formatting, tech choices, do's and don'ts. -->
- _None recorded yet._

## Architecture & Decisions

<!--
Append an entry each time a design/structural decision is made. Format:

### <Area / Section name>
- **Decision:** what was chosen.
- **Why:** the reasoning / constraints behind it.
- **Date:** YYYY-MM-DD.
- **Details:** link to docs/<area>.md if a deeper note exists.
-->
- _None recorded yet._

## Changelog of Learnings

<!-- Short running log so the sync history is visible at a glance. -->
- _None recorded yet._
