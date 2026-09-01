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
│   ├── plugin.ts       # effect
│   ├── queue.ts        # queue payload envelopes
│   ├── request.ts      # request id, headers, cookies, client meta
│   ├── router.ts       # Elysia HTTP method adapter
│   ├── routes.ts       # get/post/… helpers (delete stays effectDelete)
│   ├── runtime.ts      # ManagedRuntime, abort, Exit observation
│   ├── scheduler.ts    # cron
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

This repository has no GitHub Actions push/PR CI. **Run the local gates below before every push** — there is no remote safety net.

### Agent gate (required before push)

Run from the repository root, in order; stop at the first failure.

```bash
cd "$(git rev-parse --show-toplevel)"
( bun run check )  # check
( bun run test )   # test
```

**Stages for this repo:** `check test`

Each stage resolves to the command above from, in order, an explicit `.ci.yml` entry, a `Makefile` target, a `justfile` recipe, or a `package.json` script with the same name. When `flake.nix` exists and Nix is available, run the commands inside `nix develop`.

### Commit convention

Every commit (agents and humans) follows Conventional Commits:
`type(scope)?: summary` with type in
`build|chore|ci|docs|feat|fix|perf|refactor|research|revert|style|test`;
one logical change per commit; imperative lowercase summary; no trailing
period; prefer a 50-character header and never exceed 72; blank line before
a body that wraps at 72 columns and explains what and why. No emojis or
`wip`/`fixup!`/`squash!` commits on shared branches. Agent-authored
commits add an `Assisted-by: <agent> (<model>)` trailer; never credit an AI
tool via `Co-authored-by:`.

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
- The plugin factory is `effect`, matching `cors` / `jwt` / `cron`. Do not keep old names as aliases.
- Subpath exports stay supported for focused imports.
- Isolate Elysia HTTP registration in `router.ts` and Effect execution in `runtime.ts`.
- Keep `effect` and `elysia` as peer dependencies only. Do not nest a second copy.
- Reuse `ManagedRuntime` per Layer object. Do not `Effect.provide` on every request.
- `@elysiajs/cron` is an optional peer. Import it only from `scheduler.ts`.
- Do not re-export scheduler from the package root. Consumers import `elysia-effect/scheduler`.
- The scheduler export is `cron`. Do not keep `effectCron`.
- Header helpers use `x-effect-*`. Do not keep Elaris header names.
- Sibling consumers: Elaris `apps/api` (`workspace:*`) and Admin (`file:../elysia-effect`).
- Do not publish to npm unless USER asks. Local gates stay mandatory.
