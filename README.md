# @papachriston/elysia-effect

Private helpers for running Effect programs at Elysia HTTP boundaries.

The package lives in `~/dev/elysia-effect`. Elaris and Admin consume it as a sibling `file:` dependency.

## Public surface

Import helpers from package subpaths:

```ts
import { effectPlugin } from "@papachriston/elysia-effect/plugin"
import { effectGet, effectPost } from "@papachriston/elysia-effect/routes"
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

Consumers in this workspace use a sibling path:

```json
"@papachriston/elysia-effect": "file:../elysia-effect"
```

Elaris `apps/api` uses `file:../../../elysia-effect` so Docker can mount the package at `/elysia-effect`.
