# The Project Management MVP web app

## Business Requirements

This project is building a Project Management App. Key features:
- A user can sign up for their own account and sign in
- A signed-in user can have multiple Kanban boards, and switch between them
- Each Kanban board has fixed columns that can be renamed
- Cards can be moved with drag and drop, and edited (title, details, due date, labels, assignee)
- Cards support a comment thread
- A board can be searched/filtered by text, label, assignee, and due date
- There is an AI chat feature in a sidebar, scoped to whichever board is currently open; the AI can create / edit / move cards and set due date, labels, and assignee

## Limitations

Self-service signup with hashed passwords (no email verification, no password reset — out of scope for now).

Boards are not shared/collaborative: each board belongs to exactly one user, with no concept of inviting other accounts. "Assignee" is a free-text field, not a link to another account.

No activity log / audit trail beyond card comments.

This runs locally (in a docker container).

## Technical Decisions

- NextJS frontend, statically exported (`output: 'export'`)
- Python FastAPI backend, serving the static NextJS export at / via StaticFiles
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use the Anthropic API for the AI calls. An ANTHROPIC_API_KEY is in .env in the project root
- Use `claude-haiku-4-5-20251001` as the model (overridable via CHAT_MODEL in .env)
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Starting Point

A working MVP of the frontend has been built and is already in frontend. This is not yet designed for the Docker setup. It's a pure frontend-only demo.

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.