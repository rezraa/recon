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

## LLM Scoring Research: Qwen 3.5 Quantization Comparison

Recon scores job-candidate fit locally using [Qwen 3.5](https://huggingface.co/Qwen) via [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) (Metal/CUDA/Vulkan). I tested 5 GGUF variants across 95 real jobs to find the best size-quality tradeoff.

| Metric | **Q4_K_M 2B** | IQ4_XS 2B | IQ4_NL 2B | Q5_K_M 2B | Q4_K_M 4B |
|---|---|---|---|---|---|
| File size | 1.28 GB | 1.17 GB | 1.21 GB | 1.44 GB | 2.74 GB |
| Parse errors | **0** | 0 | 0 | 0 | 1 |
| Fallbacks (all-same axes) | **2** | 6 | 6 | 4 | 0 |
| Median score | 28 | 50 | 50 | 28 | 17 |
| Ambiguous (41-60) | **0** | 14 | 16 | 1 | 8 |

### Findings

- **Winner: Q4_K_M 2B** — Zero ambiguous scores, clean bimodal split between relevant and irrelevant jobs, only 2 fallbacks.
- **iQuants (IQ4_XS, IQ4_NL)** — 3x more fallbacks, inflated irrelevant scores (e.g. Hospice RN at 68%). They save weight size but not KV cache (the actual VRAM bottleneck).
- **Q5_K_M** — More fallbacks and over-scores some irrelevant jobs (Sales Account Executive at 78%).
- **4B** — Too harsh (60 jobs in 0-20 bucket), 1 parse error, 2x file size, may OOM on 16GB machines.
- **0-10 scale trick** — 2B models produce better score gradients on a 0-10 scale than 0-100. Scaled to 0-100 in code.
- **Context size** — Auto-select gives only 512 tokens, causing parse errors. Explicit `contextSize: 2048` fixes it.

## License

[AGPL v3](LICENSE) — Free and open source. Derivative works must remain open source under the same license, including network/SaaS deployments. Contributions are subject to a [CLA](CONTRIBUTING.md#contributor-license-agreement).

