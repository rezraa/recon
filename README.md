# Recon

[![CI](https://github.com/rezraa/recon/actions/workflows/ci.yml/badge.svg)](https://github.com/rezraa/recon/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
[![Contributing](https://img.shields.io/badge/Contributing-Guide-brightgreen.svg)](CONTRIBUTING.md)
[![Architected by: AI + HILT](https://img.shields.io/badge/Architected_by-AI_+_HILT-blueviolet.svg)](#how-its-built)
[![Built with Next.js](https://img.shields.io/badge/Next.js-16-black.svg?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-ff5e5b.svg?logo=ko-fi&logoColor=white)](https://ko-fi.com/rezraa)

**Self-hosted job intelligence platform** that aggregates listings from multiple sources, scores them against your resume, and organizes your entire job search pipeline in one place.

Built with Next.js 16, TypeScript, Tailwind v4, shadcn/ui, Drizzle ORM, BullMQ, and a dark-first pastel design system.

## How It's Built

This project is architected and directed using an **Agentic AI + HILT (Human-In-The-Loop)** workflow. Every feature is planned, specced, and reviewed by a human architect, then implemented through structured AI-assisted development — a disciplined approach to building production-quality software with AI agents.

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

<!-- Screenshots will be added after UI implementation -->

<!-- Architecture diagram will be added after implementation -->

## Quick Start

```bash
# Clone the repo
git clone https://github.com/yourusername/recon.git
cd recon

# Start everything with Docker Compose
docker compose up
```

The app will be available at `http://localhost:3000`.

### Development (without Docker)

```bash
pnpm install
pnpm dev
```

## Project Status

This project is under active development. Currently focused on the US job market with plans to expand to other regions.

## Support

If Recon helped your job search, consider [buying me a coffee](https://ko-fi.com/rezraa). It keeps the project going.

## License

[AGPL v3](LICENSE) — Free and open source. Derivative works must remain open source under the same license, including network/SaaS deployments. Contributions are subject to a [CLA](CONTRIBUTING.md#contributor-license-agreement).

