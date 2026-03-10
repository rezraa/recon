# Recon

[![CI](https://github.com/rezraa/recon/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/rezraa/recon/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
[![Contributing](https://img.shields.io/badge/Contributing-Guide-brightgreen.svg)](CONTRIBUTING.md)
[![Source Compliance](https://img.shields.io/badge/Source_Compliance-Standards-green.svg)](SOURCE-COMPLIANCE.md)
[![Architected by: AI + HITL](https://img.shields.io/badge/Architected_by-AI_+_HITL-blueviolet.svg)](TECHNICAL.md#how-its-built)
[![Built with Next.js](https://img.shields.io/badge/Next.js-16-black.svg?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-ff5e5b.svg?logo=ko-fi&logoColor=white)](https://ko-fi.com/rezraa)

**Self-hosted job intelligence platform** that aggregates listings from multiple sources, scores them against your resume, and organizes your entire job search pipeline in one place.

Built with Next.js 16, TypeScript, Tailwind v4, shadcn/ui, Drizzle ORM, BullMQ, and a dark-first pastel design system.

<!-- Screenshots will be added after UI implementation -->

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

