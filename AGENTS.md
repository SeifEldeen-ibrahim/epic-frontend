# Frontend agent entry point

This directory is the independent `epic-frontend` Git repository, but it belongs to the
logical project `epic`.

Before changing anything, read the control repository one directory above in this order:

1. `../AGENTS.md`
2. `../stack.json`
3. `../DOCS/overview.md`
4. `../DOCS/architecture.md`
5. `../DOCS/specs.md`
6. `../DOCS/constraints.md`
7. `../DOCS/playbook.md`
8. `../memory/MEMORY.md`

All feature planning stays in `../planning/`; never create a second feature plan here. This
repository owns only frontend source, tests, dependency manifests and component-specific
`docs/`. Use the exact task ID from the controlling plan in all agent prompts and commits.

Run project workflows from the control root (`cd ..`) so the shared skills and orchestration are
available. Commands still execute in this repository through `node tools/stack.mjs run
frontend <action>` from the control root.
