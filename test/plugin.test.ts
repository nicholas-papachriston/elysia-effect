import { describe, expect, test } from "bun:test"
import { Context, Data, Effect, Layer } from "effect"
import { Elysia } from "elysia"
import { effectPlugin } from "../src/plugin"

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

describe("effectPlugin", () => {
  test("adds a runEffect decorator for successful programs", async () => {
    const app = new Elysia()
      .use(effectPlugin())
      .get("/health", ({ runEffect }) => runEffect(Effect.succeed({ ok: true })))

    const response = await app.handle(new Request("http://localhost/health"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  test("provides the configured layer to decorated programs", async () => {
    const app = new Elysia()
      .use(effectPlugin({ layer: Layer.succeed(GreetingServiceTag, { greeting: "hello" }) }))
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
      .use(effectPlugin())
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
      .use(effectPlugin({ layer: Layer.succeed(GreetingServiceTag, { greeting: "private" }) }))
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
    const app = new Elysia().use(effectPlugin()).get("/defect", ({ runEffect }) =>
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
})
