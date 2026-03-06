# battlefield-buds - Multi-Mode Portal Scripting Workspace
Repo for Battlefield Buds custom server configurations

A modular TypeScript workspace for building multiple Battlefield Portal game modes using a shared scripting template and shared utilities. This repository is designed for rapid iteration, clean structure, and scalable development across multiple game modes.

---

## Architecture Overview

The workspace is built around three core components:

- **Template** — a reusable base project copied into each new game mode.
- **Utils** — shared logic, helpers, and abstractions used across all modes.
- **Modes** — isolated game‑mode projects, each with its own build pipeline.

Each mode is a fully independent TypeScript project

## Development Flow
The development workflow is optimized for speed and consistency.

## 1. Create a new game mode

Copy the template into a new folder: 

''' Powershell
cd /battlefield_buds/ (this is the BB root directory)
copy-item -Path .\bf6-reference-template\ -Destination .\src\modes\bb-strikepoint\ -Recurse
cd src/modes/<mode-name>/bf6-references-template/
npm install
npm run init (This will run a script that will set up the environment)
npm run build (This command will put a .ts & a .json file in the /dist/ directory of each independent game mode, these files will be the ones that will be pasted into the portal)
More information can be found at the template original repo by Mike Deluca.


## 2. Visual Diagram - How Everything Connects
                   ┌────────────────────────────┐
                   │   bf6-reference-template/  │<────────────────────────────────────┐
                   │  Base TS project structure │                                     |
                   └──────────────┬─────────────┘                                     |
                                  │ (copy)                                            |
                                  ▼                                      ┌────────────────────────┐
        ┌──────────────────────────────────────────────────────┐         | bf6-reference-template/|
        │                      modes/                          │         |    Mike Deluca Repo    |
        │                                                      │         └────────────────────────┘                        
        │   ┌──────────────────────┐   ┌─────────────────────┐ │
        │   │   smoke_box_br/      │   │     strikepoint/    │ │
        │   │  Independent project │   │  Independent project│ │
        │   └───────────┬──────────┘   └──────────┬──────────┘ │
        │               │ (imports)               │ (imports)  │
        └───────────────┼─────────────────────────┼────────────┘
                        ▼                         ▼
                 ┌────────────────────────────────────────┐
                 │                 utils/                 │
                 │ Shared helpers, math, player logic, etc│
                 └────────────────────────────────────────┘
                 