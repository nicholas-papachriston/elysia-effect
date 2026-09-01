import { describe, expect, test } from "bun:test"
import { Context, Data, Effect, Layer, Schema } from "effect"
import { Elysia } from "elysia"
import { RequestContextTag } from "../src/context"
import { effect } from "../src/plugin"
import { get } from "../src/routes"
import { toElysiaValidator } from "../src/schema"

interface GreetingService {
  readonly greeting: string
}

class GreetingServiceTag extends Context.Tag("PluginGreetingService")<
  GreetingServiceTag,
  GreetingService
>() {}

class AuthError extends Data.TaggedError("AuthError")<{
  readonly message: string
}> {}

describe("effect", () => {
  test("registers under the unscoped plugin name", () => {
    expect(effect().config.name).toBe("elysia-effect")
  })

  test("adds a runEffect decorator for successful programs", async () => {
    const app = new Elysia()
      .use(effect())
      .get("/health", ({ runEffect }) => runEffect(Effect.succeed({ ok: true })))

    const response = await app.handle(new Request("http://localhost/health"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  test("provides the configured layer to decorated programs", async () => {
    const app = new Elysia()
      .use(effect({ layer: Layer.succeed(GreetingServiceTag, { greeting: "hello" }) }))
      .get("/greeting", ({ runEffect }) =>
        runEffect(
          Effect.gen(function* () {
            const service = yield* GreetingServiceTag

            return { greeting: service.greeting }
          })
        )
      )

    const response = await app.handle(new Request("http://localhost/greeting"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ greeting: "hello" })
  })

  test("maps typed failures returned through runEffect", async () => {
    const app = new Elysia()
      .use(effect())
      .get("/private", ({ runEffect }) =>
        runEffect(Effect.fail(new AuthError({ message: "Sign in required" })))
      )

    const response = await app.handle(new Request("http://localhost/private"))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      code: "auth_error",
      message: "Sign in required"
    })
  })

  test("maps typed failures after providing the configured layer", async () => {
    const app = new Elysia()
      .use(effect({ layer: Layer.succeed(GreetingServiceTag, { greeting: "private" }) }))
      .get("/layered-private", ({ runEffect }) =>
        runEffect(
          Effect.gen(function* () {
            const service = yield* GreetingServiceTag

            return yield* Effect.fail(
              new AuthError({ message: `${service.greeting} sign in required` })
            )
          })
        )
      )

    const response = await app.handle(new Request("http://localhost/layered-private"))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      code: "auth_error",
      message: "private sign in required"
    })
  })

  test("maps unexpected defects to internal errors", async () => {
    const app = new Elysia().use(effect()).get("/defect", ({ runEffect }) =>
      runEffect(
        Effect.sync(() => {
          throw new Error("boom")
        })
      )
    )

    const response = await app.handle(new Request("http://localhost/defect"))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      code: "internal_error",
      message: "Internal server error"
    })
  })

  test("unwraps Effect values returned from native Elysia handlers", async () => {
    const app = new Elysia()
      .use(effect({ layer: Layer.succeed(GreetingServiceTag, { greeting: "native" }) }))
      .get("/native", () =>
        Effect.gen(function* () {
          const service = yield* GreetingServiceTag

          return { greeting: service.greeting }
        })
      )

    const response = await app.handle(new Request("http://localhost/native"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ greeting: "native" })
  })

  test("maps typed failures from native Effect returns", async () => {
    const app = new Elysia()
      .use(effect())
      .get("/denied", () => Effect.fail(new AuthError({ message: "native deny" })))

    const response = await app.handle(new Request("http://localhost/denied"))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      code: "auth_error",
      message: "native deny"
    })
  })

  test("leaves non-Effect responses unchanged", async () => {
    const app = new Elysia().use(effect()).get("/plain", () => ({ ok: true }))

    const response = await app.handle(new Request("http://localhost/plain"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  test("unwraps Effect values inside an Elysia group", async () => {
    const app = new Elysia()
      .use(effect())
      .group("/v1", (grouped) => grouped.get("/health", () => Effect.succeed({ ok: true })))

    const response = await app.handle(new Request("http://localhost/v1/health"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  test("provides RequestContext to native Effect returns", async () => {
    const app = new Elysia().use(effect()).get("/ctx", () =>
      Effect.gen(function* () {
        const context = yield* RequestContextTag

        return { requestId: context.requestId }
      })
    )

    const response = await app.handle(
      new Request("http://localhost/ctx", {
        headers: {
          "x-request-id": "native-request-1"
        }
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ requestId: "native-request-1" })
  })

  test("route helpers inherit the plugin layer", async () => {
    const app = new Elysia().use(
      effect({ layer: Layer.succeed(GreetingServiceTag, { greeting: "plugin" }) })
    )
    get(app, "/inherited", {}, () =>
      Effect.gen(function* () {
        const service = yield* GreetingServiceTag

        return { greeting: service.greeting }
      })
    )

    const response = await app.handle(new Request("http://localhost/inherited"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ greeting: "plugin" })
  })

  test("validates native Elysia routes with Effect Schema", async () => {
    const Item = Schema.Struct({
      name: Schema.String
    })
    const app = new Elysia().use(effect()).post(
      "/items",
      ({ body }) => Effect.succeed({ name: body.name }),
      toElysiaValidator({
        body: Item,
        response: Item
      })
    )

    const valid = await app.handle(
      new Request("http://localhost/items", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name: "Elaris" })
      })
    )
    const invalid = await app.handle(
      new Request("http://localhost/items", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name: 1 })
      })
    )

    expect(valid.status).toBe(200)
    await expect(valid.json()).resolves.toEqual({ name: "Elaris" })
    expect(invalid.status).toBeGreaterThanOrEqual(400)
  })
})
