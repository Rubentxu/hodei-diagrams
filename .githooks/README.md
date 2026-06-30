# Setup

## Git hooks (cycle 21)

This repo ships git hooks in `.githooks/`. They're not auto-installed
(so the repo state doesn't surprise a fresh clone). To enable:

```bash
git config core.hooksPath .githooks
```

After this, the pre-commit hook will block any new e2e spec that
introduces the legacy `goto + networkidle` anti-pattern (cycle 18
gotcha). On block, the message tells you to switch to `waitForAppReady`.

To opt out temporarily for one commit (e.g., you're refactoring the
helper itself), use `--no-verify`:

```bash
git commit --no-verify -m "refactor: update waitForAppReady timing"
```

The hook fires only on staged e2e spec files (`web-shell/tests/e2e/*.spec.ts`).
Mid-test `page.reload()` patterns are tolerated.
