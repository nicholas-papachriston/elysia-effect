# elysia-effect

Elysia plugin for Effect programs, schemas, errors, streams, and cron.

This follows the community plugin name form `elysia-<feature>`. Official plugins use `@elysiajs/*`. This package cannot publish under that org.

The plugin stays small. Effect and Elysia stay peer dependencies. `@elysiajs/cron` is optional and is only needed for `elysia-effect/scheduler`. The package root does not load cron.

## Installation

```bash
bun add elysia-effect
```

## Usage

Put `effectPlugin` on the app before routes that return Effect values. The plugin unwraps native Effect returns, maps tagged errors, and provides `RequestContextTag`.

```ts
import { Elysia } from "elysia"
import { Effect } from "effect"
import { effectPlugin } from "elysia-effect"

const app = new Elysia()
  .use(effectPlugin({ layer: AppLive, mapError, auth, telemetry }))
  .get("/health", () => Effect.succeed({ ok: true }))
```

Use Effect Schema helpers when you want decode, encode, and OpenAPI from one contract:

```ts
import { effectPlugin, effectPost } from "elysia-effect"

const app = new Elysia().use(effectPlugin({ layer: AppLive, mapError }))

effectPost(app, "/items", { schemas: { body: CreateItem, response: Item } }, ({ body }) =>
  ItemService.create(body)
)
```

Stay on native `.get` / `.post` and pass Effect Schema values through Standard Schema:

```ts
import { toElysiaValidator, toStandardSchema } from "elysia-effect"

app.post(
  "/items",
  ({ body }) => ItemService.create(body),
  toElysiaValidator({
    body: CreateItem,
    response: Item
  })
)

app.post("/items", ({ body }) => ItemService.create(body), {
  body: toStandardSchema(CreateItem)
})
```

`runEffect` remains available for handlers that are not Effect-native yet:

```ts
app.get("/health", ({ runEffect }) => runEffect(Effect.succeed({ ok: true })))
```

Subpath imports remain supported:

```ts
import { effectPlugin } from "elysia-effect/plugin"
import { effectGet, effectPost } from "elysia-effect/routes"
import { effectCron } from "elysia-effect/scheduler"
```

Supported subpaths:

- `./context` — request context types and `RequestContextTag`
- `./routes` — `effectGet`, `effectPost`, `effectPatch`, `effectPut`, `effectDelete`, `effectHead`, `effectOptions`, `effectAll`, `effectConnect`, `effectTrace`, `effectRoute`
- `./handler` — `createEffectHandler`, auth helpers, telemetry option types
- `./schema` — `decodeUnknown`, `encode`, `toStandardSchema`, `toElysiaValidator`
- `./errors` — `defaultErrorMapper`, `ValidationError`
- `./openapi` — OpenAPI helpers
- `./stream` — streaming and SSE helpers
- `./scheduler` — cron helpers (`@elysiajs/cron` required)
- `./runtime` — ManagedRuntime runner and abort helpers
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
- Put `effectPlugin` on the app before routes that return Effect values.
- Isolate Elysia HTTP registration and Effect execution. Do not leak nested Effect or Elysia types into consumer signatures.

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
