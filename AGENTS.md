# elysia-effect

## Project Overview

`elysia-effect` is a public TypeScript library. It runs Effect programs at Elysia HTTP boundaries: routes, schema decode/encode, tagged-error HTTP mapping, SSE streams, queue envelopes, and cron jobs. The npm name is unscoped `elysia-effect`. The plugin factory is `effect`, the same pattern as `cors` and `jwt`.

**Tech stack:** TypeScript (strict), Bun runtime and test runner, oxfmt for format, oxlint McCabe CCN 20 as a lint deny. Effect `^3.18.0` and Elysia `^1.4.0` are peer dependencies only. `@elysiajs/cron` is an optional peer for `elysia-effect/scheduler`.

Elaris (`apps/api`) and Admin consume this package from the sibling checkout via `file:` paths. Do not add product-domain packages here.

## Repository Structure

```
elysia-effect/
├── src/
│   ├── index.ts        # package root re-export (plugin convention)
│   ├── context.ts      # RequestContextTag and auth context types
│   ├── errors.ts       # ValidationError and defaultErrorMapper
│   ├── handler.ts      # createEffectHandler and auth helpers
│   ├── openapi.ts      # OpenAPI JSON Schema helpers
│   ├── plugin.ts       # effect (alias: effectPlugin)
│   ├── queue.ts        # queue payload envelopes
│   ├── request.ts      # request id, headers, cookies, client meta
│   ├── router.ts       # Elysia HTTP method adapter
│   ├── routes.ts       # get/post/… helpers (delete stays effectDelete)
│   ├── runtime.ts      # ManagedRuntime, abort, Exit observation
│   ├── scheduler.ts    # cron (alias: effectCron)
│   ├── schema.ts       # decodeUnknown / encode / toStandardSchema
│   ├── stream.ts       # SSE and ReadableStream helpers
│   ├── telemetry.ts    # global Effect route telemetry
│   └── trace.ts        # x-trace-id / traceparent
├── test/               # bun:test coverage per module
├── package.json
├── LICENSE
├── tsconfig.json
├── .oxfmtrc.json
├── .oxlintrc.json
├── AGENTS.md
└── README.md
```

## Build Commands

| Command             | Description                                    |
| ------------------- | ---------------------------------------------- |
| `bun install`       | Install dependencies                           |
| `bun run typecheck` | `tsc --noEmit`                                 |
| `bun run lint`      | oxfmt + oxlint `--fix`, then fail on leftovers |
| `bun run fix`       | oxfmt + oxlint `--fix`                         |
| `bun run check`     | lint then typecheck                            |
| `bun test`          | bun:test                                       |

**Run locally (from repo root):**

```bash
bun install
bun run check
bun test
```

## CI/CD

Quality gates use the shared **devctl** CLI from the [`nicholas-papachriston/dev`](https://github.com/nicholas-papachriston/dev) meta-repo. **GitHub Actions push/PR CI is disabled workspace-wide** except `shotput` (native `ci.yml` / `publish.yml`). **Run gates locally before every push** — there is no GitHub safety net elsewhere.

### Agent gate (required before push)

```bash
# Resolve devctl (standalone sparse clone — no submodules required):
#   git clone --depth 1 --filter=blob:none --sparse git@github.com:nicholas-papachriston/dev.git /tmp/dev
#   cd /tmp/dev && git sparse-checkout set cli ci-cd
#   export DEVCTL=/tmp/dev/cli/devctl.ts
#
# Typical layouts:
#   export DEVCTL="$HOME/dev/cli/devctl.ts"   # full ~/dev checkout
#   export DEVCTL="../cli/devctl.ts"          # sibling when repo lives under ~/dev/

ROOT="$(git rev-parse --show-toplevel)"
bun "${DEVCTL:-$HOME/dev/cli/devctl.ts}" ci list --cwd "$ROOT"
bun "${DEVCTL:-$HOME/dev/cli/devctl.ts}" ci run check test --cwd "$ROOT"
```

**Stages for this repo:** `check test`

Optional `.ci.yml` at the repo root overrides stage commands. Pass `--nix` when `flake.nix` exists and Nix is available. Engine docs: [`ci-cd/README.md`](https://github.com/nicholas-papachriston/dev/blob/main/ci-cd/README.md) (consumption is SSH sparse-checkout of `cli/` and `ci-cd/`; never npm).

### Commit convention

Every commit (agents and humans) follows the workspace convention:
`type(scope)?: summary` per Conventional Commits with type in
`build|chore|ci|docs|feat|fix|perf|refactor|research|revert|style|test`;
one logical change per commit; imperative lowercase summary; no trailing
period; prefer a 50-character header and never exceed 72; blank line before
a body that wraps at 72 columns and explains what and why. No emojis or
`wip`/`fixup!`/`squash!` commits on shared branches. Agent-authored
commits add an `Assisted-by: <agent> (<model>)` trailer; never credit an AI
tool via `Co-authored-by:`. Validate before push:
`bun "${DEVCTL:-$HOME/dev/cli/devctl.ts}" commit check --range origin/main..HEAD`.

## Documentation

| File        | Role                                                       |
| ----------- | ---------------------------------------------------------- |
| `AGENTS.md` | Agent playbook — build gates, conventions, env (this file) |
| `CLAUDE.md` | Pointer to `AGENTS.md`                                     |
| `README.md` | Human setup and consumer guide                             |

Read this file before editing code.

## Notes

- Keep tagged HTTP mappings structural. Do not import Elaris or Admin domain packages.
- Keep the package root export. Community Elysia plugins import from the package name.
- The plugin factory is `effect`, matching `cors` / `jwt` / `cron`. `effectPlugin` remains an alias.
- Subpath exports stay supported for focused imports.
- Isolate Elysia HTTP registration in `router.ts` and Effect execution in `runtime.ts`.
- Keep `effect` and `elysia` as peer dependencies only. Do not nest a second copy.
- Reuse `ManagedRuntime` per Layer object. Do not `Effect.provide` on every request.
- `@elysiajs/cron` is an optional peer. Import it only from `scheduler.ts`.
- Do not re-export scheduler from the package root. Consumers import `elysia-effect/scheduler`.
- The scheduler export is `cron`. `effectCron` remains an alias.
- Trusted auth headers stay `x-elaris-*` for Elaris compatibility.
- Sibling consumers: Elaris `apps/api` (`workspace:*`) and Admin (`file:../elysia-effect`).
- Do not publish to npm unless USER asks. Local gates stay mandatory.
