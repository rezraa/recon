# Contributing to Recon

Thanks for your interest in contributing.

## Contributor License Agreement

By submitting a pull request to this project, you agree to the following:

- Your contribution is your original work (or you have the right to submit it)
- Your contribution is licensed under [GPLv3](LICENSE), the same license as the project
- You grant the project maintainer a non-exclusive, irrevocable, worldwide license to use, modify, and redistribute your contribution under any license, including proprietary licenses

## What We're Looking For

We especially welcome:

- **Bug fixes** and performance improvements
- **Source adapters** for new job boards
- **Documentation** and accessibility improvements
- **Test coverage** improvements

For large feature work, **open an issue first** to discuss before investing time.

## How to Contribute

1. **Open an issue first** — describe the bug or feature
2. **Fork and branch** — create a feature branch from `main`
3. **Follow conventions** — match the existing code style (see below)
4. **Test your changes** — run `pnpm test`, `pnpm lint`, and `pnpm typecheck`
5. **Submit a PR** — reference the issue in your description

## Development Setup

```bash
git clone https://github.com/yourusername/recon.git
cd recon
pnpm install
pnpm dev
```

## Code Style

- Named exports only (no default exports in application source code)
- TypeScript strict mode — no `any` types
- All env access through `src/lib/config.ts`
- Import order enforced by `eslint-plugin-simple-import-sort`
- Co-locate tests: `*.test.ts` next to the file being tested

## License

This project is licensed under [GPLv3](LICENSE). The CLA above applies to all contributions.
