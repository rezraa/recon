# Technical Details

## How It's Built

This project is architected and directed using an **Agentic AI + HITL (Human-In-The-Loop)** workflow. Every feature is planned, specced, and reviewed by a human architect, then implemented through structured AI-assisted development — a disciplined approach to building production-quality software with AI agents.

**What this means:**
- All architecture decisions, product requirements, and UX design are human-driven
- Implementation follows rigorous story specs with acceptance criteria and red-green-refactor TDD
- Every story goes through automated validation and code review (using a different LLM than the one that implemented it)
- The result is a transparent, reproducible, and professional development process

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind v4, shadcn/ui, CSS variables |
| Database | PostgreSQL 16 via Drizzle ORM |
| Queue | BullMQ + Redis 7 (ioredis) |
| Testing | Vitest, Testing Library, Playwright, MSW |
| UI Extras | Framer Motion, Nivo Charts, dnd-kit, cmdk |
