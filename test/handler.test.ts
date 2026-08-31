import { describe, expect, test } from "bun:test"
import { Context, Data, Effect, Layer, Schema } from "effect"
import { RequestContextTag } from "../src/context"
import type { ElysiaLikeContext } from "../src/handler"
import {
  anonymousAuth,
  authFromHeaders,
  createEffectHandler,
  TRUSTED_AUTH_HEADER,
  trustedAuthFromHeaders
} from "../src/handler"

const Body = Schema.Struct({
  name: Schema.String
})

const HeadersSchema = Schema.Struct({
  "x-phase": Schema.String
})

const CookiesSchema = Schema.Struct({
  session: Schema.String
})

const ResponseBody = Schema.Struct({
  greeting: Schema.String
})

const makeContext = (
  body: unknown,
  headers: Record<string, string> = {},
  requestInit: RequestInit = {}
): ElysiaLikeContext => ({
  request: new Request("http://localhost/test", {
    ...requestInit,
    headers: {
      "x-request-id": "request-1",
      ...requestInit.headers,
      ...headers
    }
  }),
  body,
  query: {},
  params: {},
  headers: {
    "x-request-id": "request-1"
  },
  set: {}
})

interface GreetingService {
  readonly prefix: string
}

class GreetingServiceTag extends Context.Tag("GreetingService")<
  GreetingServiceTag,
  GreetingService
>() {}

class EligibilityError extends Data.TaggedError("EligibilityError")<{
  readonly message: string
  readonly reason: "email_verification_required"
}> {}

class NotificationError extends Data.TaggedError("NotificationError")<{
  readonly message: string
}> {}

describe("createEffectHandler", () => {
  test("decodes input, runs an Effect, and encodes output", async () => {
    const handler = createEffectHandler(
      {
        schemas: {
          body: Body,
          response: ResponseBody
        }
      },
      ({ body }) => Effect.succeed({ greeting: `Hello, ${body.name}` })
    )

    const context = makeContext({ name: "Elaris" })
    const result = await handler(context)

    expect(result).toEqual({ greeting: "Hello, Elaris" })
    expect(context.set.headers).toEqual({ "x-request-id": "request-1", "x-trace-id": "request-1" })
  })

  test("returns a validation response for invalid input", async () => {
    const handler = createEffectHandler(
      {
        schemas: {
          body: Body,
          response: ResponseBody
        }
      },
      ({ body }) => Effect.succeed({ greeting: `Hello, ${body.name}` })
    )

    const context = makeContext({ name: 1 })
    const result = await handler(context)

    expect(context.set.status).toBe(400)
    expect(result).toMatchObject({
      code: "validation_error"
    })
  })

  test("provides configured layers to Effect handlers", async () => {
    const handler = createEffectHandler(
      {
        layer: Layer.succeed(GreetingServiceTag, { prefix: "Hello" }),
        schemas: {
          body: Body,
          response: ResponseBody
        }
      },
      ({ body }) =>
        Effect.gen(function* () {
          const service = yield* GreetingServiceTag

          return { greeting: `${service.prefix}, ${body.name}` }
        })
    )

    const result = await handler(makeContext({ name: "Elaris" }))

    expect(result).toEqual({ greeting: "Hello, Elaris" })
  })

  test("injects auth and request context into Effect handlers", async () => {
    const handler = createEffectHandler(
      {
        auth: authFromHeaders,
        schemas: {
          response: ResponseBody
        }
      },
      () =>
        Effect.gen(function* () {
          const context = yield* RequestContextTag

          return {
            greeting: `${context.auth.userId}:${context.auth.isAdmin}:${context.auth.isEmailVerified}`
          }
        })
    )

    const result = await handler(
      makeContext(undefined, {
        "x-elaris-user-id": "user-1",
        "x-elaris-admin": "true",
        "x-elaris-email-verified": "true"
      })
    )

    expect(result).toEqual({ greeting: "user-1:true:true" })
  })

  test("awaits async auth providers", async () => {
    const handler = createEffectHandler(
      {
        auth: async () => ({
          userId: "async-user",
          isAdmin: true,
          isEmailVerified: false
        }),
        schemas: {
          response: ResponseBody
        }
      },
      () =>
        Effect.gen(function* () {
          const context = yield* RequestContextTag

          return {
            greeting: `${context.auth.userId}:${context.auth.isAdmin}:${context.auth.isEmailVerified}`
          }
        })
    )

    const result = await handler(makeContext(undefined))

    expect(result).toEqual({ greeting: "async-user:true:false" })
  })

  test("trusted auth ignores raw identity headers without trusted marker", async () => {
    const rawSpoof = trustedAuthFromHeaders(
      makeContext(undefined, {
        "x-elaris-user-id": "spoofed-user",
        "x-elaris-admin": "true",
        "x-elaris-email-verified": "true"
      })
    )
    const trusted = trustedAuthFromHeaders(
      makeContext(undefined, {
        [TRUSTED_AUTH_HEADER]: "true",
        "x-elaris-user-id": "trusted-user",
        "x-elaris-admin": "true",
        "x-elaris-email-verified": "true"
      })
    )

    expect(rawSpoof).toEqual({
      isAdmin: false,
      isEmailVerified: false
    })
    expect(trusted).toEqual({
      userId: "trusted-user",
      isAdmin: true,
      isEmailVerified: true
    })
  })

  test("trusted auth treats non-true marker values as anonymous", () => {
    expect(
      trustedAuthFromHeaders(
        makeContext(undefined, {
          [TRUSTED_AUTH_HEADER]: "True",
          "x-elaris-user-id": "spoofed-user",
          "x-elaris-admin": "true"
        })
      )
    ).toEqual(anonymousAuth)
    expect(
      trustedAuthFromHeaders(
        makeContext(undefined, {
          [TRUSTED_AUTH_HEADER]: "1",
          "x-elaris-user-id": "spoofed-user"
        })
      )
    ).toEqual(anonymousAuth)
  })

  test("trusted auth accepts partial identity when the trusted marker is present", () => {
    expect(
      trustedAuthFromHeaders(
        makeContext(undefined, {
          [TRUSTED_AUTH_HEADER]: "true",
          "x-elaris-admin": "true"
        })
      )
    ).toEqual({
      isAdmin: true,
      isEmailVerified: false
    })
    expect(
      trustedAuthFromHeaders(
        makeContext(undefined, {
          [TRUSTED_AUTH_HEADER]: "true",
          "x-elaris-user-id": "trusted-user"
        })
      )
    ).toEqual({
      userId: "trusted-user",
      isAdmin: false,
      isEmailVerified: false
    })
  })

  test("trusted auth is injected into Effect handlers only with the trusted marker", async () => {
    const handler = createEffectHandler(
      {
        auth: trustedAuthFromHeaders,
        schemas: {
          response: ResponseBody
        }
      },
      () =>
        Effect.gen(function* () {
          const context = yield* RequestContextTag

          return {
            greeting: `${context.auth.userId ?? "anonymous"}:${context.auth.isAdmin}`
          }
        })
    )

    const spoofed = await handler(
      makeContext(undefined, {
        "x-elaris-user-id": "spoofed-user",
        "x-elaris-admin": "true"
      })
    )
    const trusted = await handler(
      makeContext(undefined, {
        [TRUSTED_AUTH_HEADER]: "true",
        "x-elaris-user-id": "trusted-user",
        "x-elaris-admin": "true"
      })
    )

    expect(spoofed).toEqual({ greeting: "anonymous:false" })
    expect(trusted).toEqual({ greeting: "trusted-user:true" })
  })

  test("maps typed Effect errors to HTTP responses", async () => {
    const handler = createEffectHandler(
      {
        schemas: {
          response: ResponseBody
        }
      },
      () =>
        Effect.fail(
          new EligibilityError({
            message: "Email verification required",
            reason: "email_verification_required"
          })
        )
    )

    const context = makeContext(undefined)
    const result = await handler(context)

    expect(context.set.status).toBe(403)
    expect(result).toEqual({
      code: "email_verification_required",
      message: "Email verification required"
    })
  })

  test("maps notification delivery failures to provider-style HTTP responses", async () => {
    const handler = createEffectHandler(
      {
        schemas: {
          response: ResponseBody
        }
      },
      () => Effect.fail(new NotificationError({ message: "Email provider unavailable" }))
    )

    const context = makeContext(undefined)
    const result = await handler(context)

    expect(context.set.status).toBe(502)
    expect(result).toEqual({
      code: "notification_error",
      message: "Email provider unavailable"
    })
  })

  test("decodes headers and cookies with Effect Schema", async () => {
    const handler = createEffectHandler(
      {
        schemas: {
          headers: HeadersSchema,
          cookies: CookiesSchema,
          response: ResponseBody
        }
      },
      ({ headers, cookies }) =>
        Effect.succeed({ greeting: `${headers["x-phase"]}:${cookies.session}` })
    )

    const result = await handler(
      makeContext(undefined, {
        cookie: "session=abc123",
        "x-phase": "phase-2"
      })
    )

    expect(result).toEqual({ greeting: "phase-2:abc123" })
  })

  test("returns a validation response for invalid cookies", async () => {
    const handler = createEffectHandler(
      {
        schemas: {
          cookies: CookiesSchema,
          response: ResponseBody
        }
      },
      ({ cookies }) => Effect.succeed({ greeting: cookies.session })
    )

    const context = makeContext(undefined)
    const result = await handler(context)

    expect(context.set.status).toBe(400)
    expect(result).toMatchObject({
      code: "validation_error"
    })
  })

  test("adds client IP and user agent to request context", async () => {
    const handler = createEffectHandler(
      {
        schemas: {
          response: ResponseBody
        }
      },
      () =>
        Effect.gen(function* () {
          const context = yield* RequestContextTag

          return {
            greeting: `${context.clientIp}:${context.userAgent}`
          }
        })
    )

    const result = await handler(
      makeContext(undefined, {
        "user-agent": "phase-2-test",
        "x-forwarded-for": "203.0.113.1, 10.0.0.1"
      })
    )

    expect(result).toEqual({ greeting: "203.0.113.1:phase-2-test" })
  })

  test("emits telemetry lifecycle hooks", async () => {
    const events: string[] = []
    const handler = createEffectHandler(
      {
        schemas: {
          response: ResponseBody
        },
        telemetry: {
          onStart: (event) => events.push(`start:${event.requestId}:${event.method}:${event.path}`),
          onSuccess: (event) => events.push(`success:${event.requestId}:${event.durationMs >= 0}`),
          onError: (event) => events.push(`error:${event.requestId}:${String(event.error)}`)
        }
      },
      () => Effect.succeed({ greeting: "ok" })
    )

    await handler(makeContext(undefined))

    expect(events).toEqual(["start:request-1:GET:/test", "success:request-1:true"])
  })

  test("emits telemetry error hooks for typed failures", async () => {
    const events: string[] = []
    const handler = createEffectHandler(
      {
        schemas: {
          response: ResponseBody
        },
        telemetry: {
          onError: (event) => events.push(`error:${event.requestId}:${event.durationMs >= 0}`)
        }
      },
      () =>
        Effect.fail(
          new EligibilityError({
            message: "Region blocked",
            reason: "region_blocked"
          })
        )
    )

    await handler(makeContext(undefined))

    expect(events).toEqual(["error:request-1:true"])
  })

  test("propagates request abort signals", async () => {
    const controller = new AbortController()
    controller.abort()

    const handler = createEffectHandler(
      {
        schemas: {
          response: ResponseBody
        }
      },
      ({ abortSignal }) => Effect.succeed({ greeting: String(abortSignal.aborted) })
    )

    const result = await handler(makeContext(undefined, {}, { signal: controller.signal }))

    expect(result).toEqual({ greeting: "true" })
  })

  test("decodes query and route params", async () => {
    const Query = Schema.Struct({ filter: Schema.String })
    const Params = Schema.Struct({ id: Schema.String })

    const handler = createEffectHandler(
      {
        schemas: {
          query: Query,
          params: Params,
          response: ResponseBody
        }
      },
      ({ query, params }) => Effect.succeed({ greeting: `${params.id}:${query.filter}` })
    )

    const context = makeContext(undefined)
    context.query = { filter: "active" }
    context.params = { id: "character-1" }

    const result = await handler(context)

    expect(result).toEqual({ greeting: "character-1:active" })
  })

  test("reads Elysia-style cookie objects", async () => {
    const handler = createEffectHandler(
      {
        schemas: {
          cookies: CookiesSchema,
          response: ResponseBody
        }
      },
      ({ cookies }) => Effect.succeed({ greeting: cookies.session })
    )

    const context = makeContext(undefined)
    context.cookie = { session: { value: "elysia-session" } }

    const result = await handler(context)

    expect(result).toEqual({ greeting: "elysia-session" })
  })

  test("uses x-real-ip when x-forwarded-for is absent", async () => {
    const handler = createEffectHandler(
      {
        schemas: {
          response: ResponseBody
        }
      },
      () =>
        Effect.gen(function* () {
          const context = yield* RequestContextTag

          return { greeting: context.clientIp ?? "missing" }
        })
    )

    const result = await handler(makeContext(undefined, { "x-real-ip": "198.51.100.7" }))

    expect(result).toEqual({ greeting: "198.51.100.7" })
  })

  test("generates a request id when none is provided", async () => {
    const handler = createEffectHandler(
      {
        schemas: {
          response: ResponseBody
        }
      },
      ({ requestId }) => Effect.succeed({ greeting: requestId })
    )

    const context = makeContext(undefined)
    context.headers = {}
    context.request = new Request("http://localhost/generated-id")

    const result = await handler(context)

    expect(typeof result).toBe("object")
    if (typeof result === "object" && result !== null && "greeting" in result) {
      expect(String(result.greeting)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    }
    expect(context.set.headers?.["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
  })

  test("uses a custom error mapper when configured", async () => {
    const handler = createEffectHandler(
      {
        mapError: () => ({
          status: 418,
          body: { code: "custom_teapot", message: "Custom mapped" }
        }),
        schemas: {
          response: ResponseBody
        }
      },
      () => Effect.fail(new Error("ignored"))
    )

    const context = makeContext(undefined)
    const result = await handler(context)

    expect(context.set.status).toBe(418)
    expect(result).toEqual({ code: "custom_teapot", message: "Custom mapped" })
  })

  test("maps unexpected defects through the default error mapper", async () => {
    const events: string[] = []
    const handler = createEffectHandler(
      {
        schemas: {
          response: ResponseBody
        },
        telemetry: {
          onError: (event) => events.push(String(event.error))
        }
      },
      () => Effect.die("unexpected defect")
    )

    const context = makeContext(undefined)
    const result = await handler(context)

    expect(context.set.status).toBe(500)
    expect(result).toEqual({
      code: "internal_error",
      message: "Internal server error"
    })
    expect(events).toHaveLength(1)
  })
})
