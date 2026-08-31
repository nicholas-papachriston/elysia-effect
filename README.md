# elysia-effect

Elysia plugin for Effect programs, schemas, errors, streams, and cron.

This follows the community plugin name form `elysia-<feature>`. Official plugins use `@elysiajs/*`. This package cannot publish under that org.

## Installation

```bash
bun add elysia-effect
```

Peer dependencies: `elysia`, `effect`, and `@elysiajs/cron`.

## Usage

```ts
import { Elysia } from "elysia"
import { effectPlugin, effectGet } from "elysia-effect"

const app = new Elysia().use(effectPlugin())

effectGet(app, "/health", () => ({ ok: true }))
```

Subpath imports remain supported:

```ts
import { effectPlugin } from "elysia-effect/plugin"
import { effectGet, effectPost } from "elysia-effect/routes"
```

Supported subpaths:

- `./context` — request context types and `RequestContextTag`
- `./routes` — `effectGet`, `effectPost`, `effectPatch`, `effectPut`, `effectDelete`
- `./handler` — `createEffectHandler`, auth helpers, telemetry option types
- `./schema` — `decodeUnknown`, `encode`
- `./errors` — `defaultErrorMapper`, `ValidationError`
- `./openapi` — OpenAPI helpers
- `./stream` — streaming and SSE helpers
- `./scheduler` — cron helpers
- `./queue` — queue payload envelope helpers
- `./telemetry` — global Effect route telemetry
- `./plugin` — `effectPlugin`

## Boundary rules

- Effect Schema remains the canonical schema layer.
- Route handlers should decode inputs at the boundary and delegate to Effect programs.
- Expected failures should stay typed and map through the configured error mapper.
- Request-scoped data should flow through `RequestContextTag`, not globals.
- The package must stay free of product-domain package dependencies.
- Application-specific auth and domain errors match by tagged error name.

## Setup

```bash
bun install
bun run check
bun test
```

Workspace consumers in this checkout can keep a sibling path:

```json
"elysia-effect": "file:../elysia-effect"
```
