import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { Elysia } from "elysia"
import { RequestContextTag } from "../src/context"
import { defaultErrorMapper } from "../src/errors"
import { openApiDetail, openApiRouteOptions } from "../src/openapi"
import { effectDelete, effectGet, effectPatch, effectPost } from "../src/routes"

const Params = Schema.Struct({
  id: Schema.String
})

const Query = Schema.Struct({
  filter: Schema.String
})

const Body = Schema.Struct({
  name: Schema.String
})

const ResponseBody = Schema.Struct({
  value: Schema.String
})

const makeJsonRequest = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-request-id": "route-request-1"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })

describe("effect route helpers", () => {
  test("default error mapper sanitizes repository and database failures", () => {
    expect(
      defaultErrorMapper({
        _tag: "DatabaseError",
        operation: "users.findByEmail",
        cause: new Error("password leaked in connection string")
      })
    ).toEqual({
      status: 503,
      body: { code: "database_unavailable", message: "Database operation failed" }
    })
    expect(
      defaultErrorMapper({
        _tag: "DatabaseConflictError",
        operation: "users.create",
        constraint: "users_email_unique"
      })
    ).toEqual({
      status: 409,
      body: { code: "database_conflict", message: "A conflicting record already exists" }
    })
    expect(
      defaultErrorMapper({
        _tag: "IdempotencyConflictError",
        idempotencyKey: "raw-key",
        userId: "user-1"
      })
    ).toEqual({
      status: 409,
      body: { code: "idempotency_conflict", message: "Idempotency key conflict" }
    })
  })

  test("registers an Effect GET route with params and query decoding", async () => {
    const app = effectGet(
      new Elysia(),
      "/characters/:id",
      {
        schemas: {
          params: Params,
          query: Query,
          response: ResponseBody
        }
      },
      ({ params, query }) => Effect.succeed({ value: `${params.id}:${query.filter}` })
    )

    const response = await app.handle(
      new Request("http://localhost/characters/character-1?filter=private")
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      value: "character-1:private"
    })
  })

  test("registers an Effect POST route with body decoding", async () => {
    const app = effectPost(
      new Elysia(),
      "/characters",
      {
        schemas: {
          body: Body,
          response: ResponseBody
        }
      },
      ({ body }) => Effect.succeed({ value: body.name })
    )

    const response = await app.handle(
      makeJsonRequest("http://localhost/characters", "POST", { name: "Elaris" })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ value: "Elaris" })
  })

  test("registers an Effect PATCH route", async () => {
    const app = effectPatch(
      new Elysia(),
      "/characters/:id",
      {
        schemas: {
          params: Params,
          body: Body,
          response: ResponseBody
        }
      },
      ({ params, body }) => Effect.succeed({ value: `${params.id}:${body.name}` })
    )

    const response = await app.handle(
      makeJsonRequest("http://localhost/characters/character-1", "PATCH", { name: "Updated" })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ value: "character-1:Updated" })
  })

  test("registers an Effect DELETE route", async () => {
    const app = effectDelete(
      new Elysia(),
      "/characters/:id",
      {
        schemas: {
          params: Params,
          response: ResponseBody
        }
      },
      ({ params }) => Effect.succeed({ value: params.id })
    )

    const response = await app.handle(
      new Request("http://localhost/characters/character-1", { method: "DELETE" })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ value: "character-1" })
  })

  test("provides request context to Effect handlers", async () => {
    const app = effectGet(
      new Elysia(),
      "/context",
      {
        schemas: {
          response: ResponseBody
        }
      },
      () =>
        Effect.gen(function* () {
          const context = yield* RequestContextTag

          return { value: context.requestId }
        })
    )

    const response = await app.handle(
      new Request("http://localhost/context", {
        headers: {
          "x-request-id": "context-request-1"
        }
      })
    )

    expect(response.headers.get("x-request-id")).toBe("context-request-1")
    await expect(response.json()).resolves.toEqual({ value: "context-request-1" })
  })

  test("accepts OpenAPI detail helper output as route options", async () => {
    const app = effectGet(
      new Elysia(),
      "/documented",
      {
        schemas: {
          response: ResponseBody
        }
      },
      () => Effect.succeed({ value: "documented" }),
      openApiDetail({
        summary: "Documented route",
        tags: ["test"]
      })
    )

    const response = await app.handle(new Request("http://localhost/documented"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ value: "documented" })
  })

  test("generates opt-in OpenAPI route metadata from Effect schemas", () => {
    const routeOptions = openApiRouteOptions(
      {
        body: Body,
        response: ResponseBody
      },
      openApiDetail({
        summary: "Create resource",
        tags: ["test"]
      })
    )

    expect(routeOptions.detail).toEqual({
      summary: "Create resource",
      tags: ["test"]
    })
    expect(routeOptions.body).toMatchObject({
      type: "object",
      required: ["name"],
      properties: {
        name: {
          type: "string"
        }
      }
    })
    expect(routeOptions.response?.[200]).toMatchObject({
      type: "object",
      required: ["value"],
      properties: {
        value: {
          type: "string"
        }
      }
    })
  })

  test("preserves hidden and admin OpenAPI detail flags", () => {
    const routeOptions = openApiRouteOptions(
      {
        response: ResponseBody
      },
      openApiDetail({
        hide: true,
        admin: true,
        summary: "Admin-only route",
        tags: ["admin"]
      })
    )

    expect(routeOptions.detail).toEqual({
      hide: true,
      admin: true,
      security: [{ bearerAuth: [] }],
      summary: "Admin-only route",
      tags: ["admin"]
    })
  })
})
