# elysia-effect

Plugin for [Elysia](https://elysiajs.com) that runs [Effect](https://effect.website) programs.

A handler may return `Effect`. Tagged errors map to HTTP. Effect Schema covers decode, encode, and OpenAPI.

## Installation

```bash
bun add elysia-effect
```

Peers: `effect`, `elysia`. Add `@elysiajs/cron` only for the scheduler.

## Example

```ts
import { Elysia } from "elysia"
import { Effect } from "effect"
import { effect } from "elysia-effect"

const app = new Elysia()
  .use(effect({ layer: AppLive }))
  .get("/health", () => Effect.succeed({ ok: true }))
```

Same shape as `cors`, `jwt`, and `cron`: import the plugin, then `.use(effect())`.

## Routes

```ts
import { Elysia } from "elysia"
import { effect, post } from "elysia-effect"

const app = new Elysia().use(effect({ layer: AppLive }))

post(app, "/items", { schemas: { body: CreateItem, response: Item } }, ({ body }) =>
  ItemService.create(body)
)
```

`get`, `post`, `put`, `patch`, `head`, `options`, `all`, and `route` match Elysia method names. `delete` is a reserved word, so that helper stays `effectDelete`.

Native `.post` with Standard Schema:

```ts
import { toElysiaValidator } from "elysia-effect"

app.post(
  "/items",
  ({ body }) => ItemService.create(body),
  toElysiaValidator({
    body: CreateItem,
    response: Item
  })
)
```

`runEffect` runs a program from a Promise handler:

```ts
app.get("/health", ({ runEffect }) => runEffect(Effect.succeed({ ok: true })))
```

## Config

### layer

Application `Layer`. One runtime per Layer object.

### mapError

`(error: unknown) => { status, body }`. Default: `defaultErrorMapper`.

### auth

`(context) => AuthContext | Promise<AuthContext>`.

### telemetry

`onStart`, `onSuccess`, `onError`.

## Scheduler

```ts
import { cron } from "elysia-effect/scheduler"

app.use(
  cron({
    name: "heartbeat",
    pattern: "0 * * * *",
    run: () => Effect.void
  })
)
```

Needs `@elysiajs/cron`. The package root does not load it.

## Imports

| Path                      | Exports                                          |
| ------------------------- | ------------------------------------------------ |
| `elysia-effect`           | `effect`, HTTP helpers, schema, errors, streams  |
| `elysia-effect/plugin`    | `effect`                                         |
| `elysia-effect/routes`    | `get`, `post`, `put`, `patch`, `effectDelete`, … |
| `elysia-effect/scheduler` | `cron`                                           |
| `elysia-effect/schema`    | `toElysiaValidator`, `toStandardSchema`          |
| `elysia-effect/stream`    | SSE helpers                                      |
| `elysia-effect/context`   | `RequestContextTag`                              |

Older names are not kept as aliases.

## Development

```bash
bun install
bun run check
bun test
```
