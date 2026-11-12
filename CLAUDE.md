Task: Create the Project AI Development Rules

Read:

docs/TECH_STACK.md
docs/ARCHITECTURE.md

Create:

CLAUDE.md

This file will be the permanent development guide for AI coding agents working on this repository.

Include
Project purpose

Explain what this Government Jobs Eligibility Platform does.

Source of truth

State that:

docs/PRD.md defines product requirements
docs/TECH_STACK.md defines technology decisions
docs/ARCHITECTURE.md defines system architecture
docs/DATABASE.md defines database design
docs/ELIGIBILITY_ENGINE.md defines eligibility rules architecture
docs/SECURITY.md defines security requirements

If code conflicts with documented architecture, stop and identify the conflict instead of silently changing architecture.

Development rules
TypeScript strict mode
No any unless explicitly justified
Validate external input with Zod
Keep domain/business logic separate from UI
Never put eligibility logic directly inside React components
Never trust client-side authorization
Never expose secrets
Never expose Supabase service-role credentials
Follow Row Level Security
Write tests for business logic
Write tests before changing complex eligibility logic
Keep functions focused
Avoid unnecessary abstractions
Avoid unnecessary dependencies
Prefer server-side operations for protected data
Eligibility rules

Eligibility must be:

deterministic
testable
explainable
versionable
independent of AI

AI may assist with extracting rules but must not directly determine final eligibility.

Job data

Every published job should have:

source
official advertisement URL
application URL when available
relevant dates
publication status
last updated timestamp

Never invent government job information.

AI rules

AI output is untrusted input.

Always:

AI
→ validate
→ normalize
→ review where required
→ database

Never:

AI
→ directly publish

Coding workflow

Before implementing a feature:

Read relevant documentation.
Identify affected modules.
Explain the implementation plan.
Implement the smallest reasonable change.
Run type checking.
Run linting.
Run relevant tests.
Review security implications.
Update documentation if architecture changes.

Do not modify unrelated files.

Database changes

Database schema changes must be handled through migrations.

Never manually modify production schema.

Git

Make changes in small logical commits when requested.

Do not rewrite unrelated code.

When requirements are unclear

Do not guess when the decision affects:

database schema
security
authentication
eligibility rules
privacy
external integrations
architecture

Instead, identify the ambiguity and ask for clarification.

Output

Create only CLAUDE.md.

Do not implement application features yet.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
