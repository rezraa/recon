# Scoring Strategy v2 — Symmetric Extraction + Embedding

## Overview

Single LLM call per job to extract structured JSON. Same schema for resume and job.
All scoring done downstream via embedding similarity and math. No hardcoded domain maps,
no keyword matching, fully domain-agnostic.

## Architecture

```
Resume (once, on upload)              Job (once, during pipeline)
────────────────────────              ──────────────────────────
LLM extracts structured JSON    →    LLM extracts structured JSON
       ↓                                       ↓
Embed hardSkills, title              Embed hardSkills, title
       ↓                                       ↓
       └──────── cosine similarity ────────────┘
                       ↓
              Skills axis + Domain multiplier + Experience axis
                       ↓
                 + Salary axis (math)
                       ↓
                   Final score
```

## Extraction Schema

Both resume and job get extracted to the same shape:

```json
{
  "title": "<job title>",
  "domain": "<primary professional field>",
  "seniorityLevel": "<intern|junior|mid|senior|staff|principal|director|vp>",
  "yearsExperience": 0,
  "hardSkills": ["<specific tool, language, framework, platform>"],
  "softSkills": ["<leadership, communication, etc>"],
  "certifications": ["<AWS cert, PMP, etc>"]
}
```

- Resume extraction happens once on upload, result is cached
- Job extraction happens once during the discovery pipeline, result stored in DB
- LLM temperature: 0.7, topP: 0.85
- Max tokens: 250-300 for extraction

## Scoring Axes

### Skills (weight: 0.40)

```
embed(resume.hardSkills.join(', '))  vs  embed(job.hardSkills.join(', '))
→ cosine similarity → scaleScore(sim, floor=0.25, ceil=0.75) → 0-100
```

The hardSkills embedding captures tool/technology overlap. An SDET's skills
(Selenium, Playwright, CI/CD, Kotlin) will embed close to a DevOps job's skills
(CI/CD, Docker, Kubernetes) but far from a Marketing VP's skills (Paid Search, P&L).

### Domain Multiplier (not an axis — a gate)

```
Same hardSkills similarity used as domain proxy.
scaleScore(skillsSim, floor=0.3, ceil=0.85) → 0-100 → divide by 100 → multiplier
```

Why hardSkills as domain proxy: if your tools don't overlap at all, you're in a
completely different field. No fragile domain label needed — the skills themselves
ARE the domain signal. This eliminates the instability of LLM-generated domain labels
which varied wildly across temperatures ("Software Engineering / QA" vs
"Information Technology" vs "Software Testing & Automation").

### Experience (weight: 0.30)

```
embed("<seniorityLevel> <title>")  vs  embed("<seniorityLevel> <title>")
→ cosine similarity → scaleScore(sim, floor=0.25, ceil=0.75) → 0-100
```

Captures seniority fit and role-title similarity in one embedding comparison.
"staff Staff Software Development Engineer in Test" embeds close to
"senior Senior DevOps Engineer" but far from "vp VP, Paid Search".

### Salary (weight: 0.30)

```
Math-based: user target vs job salary range.
- In range → 100 (triggers 1.15x boost)
- Slightly outside → scales down
- No data → 50 (neutral)
```

Unchanged from current production logic.

## Final Score Computation

```
raw = skills * 0.40 + experience * 0.30 + salary * 0.30
boosted = salary === 100 ? raw * 1.15 : raw
final = boosted * domainMultiplier
score = min(100, round(final))
```

## Fallback (extraction failure)

When LLM extraction fails or returns 0 hardSkills:

1. If partial extraction exists, stringify the partial JSON and embed it
2. If no extraction at all, use `"<jobTitle>. <strippedDescription>"` as text
3. Compare via cosine similarity against the full resume JSON embedding
4. Use the single fallback similarity for all axes

## Scale Function

```
scaleScore(sim, floor, ceil):
  clamped = max(0, min(1, (sim - floor) / (ceil - floor)))
  return round(clamped * 100)
```

- Skills + Experience: floor=0.25, ceil=0.75
- Domain multiplier: floor=0.3, ceil=0.85 (tighter — more aggressive gating)

## Experiment Results

Tested against top 15 jobs by current DB score. Resume: Staff SDET, 16 years, 22 skills.

| Job | Old Score | New Score | Notes |
|-----|-----------|-----------|-------|
| Senior DevOps | 55% | 73% | High tool overlap (CI/CD, automation) |
| Sr Staff SWE | 57% | 33% | Different focus, some overlap |
| Sr. Digital Architect | 47% | 32% | Architecture ≠ QA |
| Sr. AI Data Engineer | 53% | 25% | Some overlap (Python, pipelines) |
| Cloud Systems Engineer | 46% | 22% | Reasonable — adjacent field |
| VP Paid Search | 50% | 11% | Crushed — marketing tools ≠ QA tools |
| HR Administrator | 46% | 0% | Dead — zero tool overlap |
| Working Student Data/BI | 46% | 21% | Low — wrong level + different tools |

### Key improvements over production scoring

1. **Marketing VP role**: 50% → 11% (was inflated by experience embedding + salary neutral)
2. **HR Admin role**: 46% → 0% (was inflated by false keyword coverage req=98)
3. **No hardcoded domain maps** — works for any resume, any profession
4. **Domain signal derived from skills** — stable across LLM temperatures
5. **Single LLM call** — extract once, compute everything downstream

### Known tradeoffs

- Marketing VP at 11% instead of 0% (their "Ad Tech, Generative AI" skills embed
  somewhat close to automation/CI/CD skills)
- LLM extraction can fail (0 hardSkills) — fallback path handles this but is less precise
- Resume extraction should be done once and cached (label instability across runs)

## What Changed From Production

| Aspect | Production | New |
|--------|-----------|-----|
| Skills axis | Keyword overlap (word boundary) | Embedding similarity of extracted hardSkills |
| Requirements axis | LLM extracts terms → keyword coverage | Removed — merged into skills via embedding |
| Experience axis | Full-text embedding (resume exp vs job desc) | Title+seniority embedding comparison |
| Domain gate | None | hardSkills similarity as multiplier |
| LLM calls per job | 2 (extract requirements + nudge) | 1 (structured JSON extraction) |
| LLM nudge | ±10 per axis, tier-gated | Removed — all scoring is math/embeddings |
| Weights | skills=0.35 req=0.25 exp=0.20 sal=0.20 | skills=0.40 exp=0.30 sal=0.30 + domain mult |

## Experiment Script

`scripts/scoring-thinking-experiment.ts` — run against real DB data:

```bash
npx tsx --env-file=.env scripts/scoring-thinking-experiment.ts 15
```
