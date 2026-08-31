import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import {
  openApiAdminRoute,
  openApiDetail,
  openApiHiddenRoute,
  openApiRouteOptions,
  openApiSensitiveAdminRoute,
  toOpenApiJsonSchema
} from "../src/openapi"

const BasicObject = Schema.Struct({
  value: Schema.String
})

describe("OpenAPI helpers", () => {
  test("generated metadata includes route summary and tags", () => {
    const options = openApiRouteOptions(
      {
        response: BasicObject
      },
      openApiDetail({
        summary: "Documented route",
        tags: ["test"]
      })
    )

    expect(options.detail).toEqual({
      summary: "Documented route",
      tags: ["test"]
    })
    expect(options.response?.[200]).toEqual({
      type: "object",
      required: ["value"],
      properties: {
        value: {
          type: "string"
        }
      },
      additionalProperties: false
    })
  })

  test("generated schema matches expected basic object schema", () => {
    expect(toOpenApiJsonSchema(BasicObject)).toEqual({
      type: "object",
      required: ["value"],
      properties: {
        value: {
          type: "string"
        }
      },
      additionalProperties: false
    })
  })

  test("hidden and admin route metadata is respected", () => {
    const options = openApiRouteOptions(undefined, {
      detail: {
        hide: true,
        admin: true,
        summary: "Admin route",
        tags: ["admin"]
      }
    })

    expect(options.detail).toEqual({
      hide: true,
      admin: true,
      summary: "Admin route",
      tags: ["admin"],
      security: [{ bearerAuth: [] }]
    })
  })

  test("visibility helper conventions encode hidden and admin policies", () => {
    expect(
      openApiHiddenRoute({
        summary: "Provider callback",
        tags: ["webhooks"]
      }).detail
    ).toEqual({
      hide: true,
      summary: "Provider callback",
      tags: ["webhooks"]
    })

    expect(
      openApiAdminRoute({
        summary: "Admin route",
        tags: ["admin"]
      }).detail
    ).toEqual({
      admin: true,
      security: [{ bearerAuth: [] }],
      summary: "Admin route",
      tags: ["admin"]
    })

    expect(
      openApiSensitiveAdminRoute({
        summary: "Sensitive admin route",
        tags: ["admin"]
      }).detail
    ).toEqual({
      admin: true,
      hide: true,
      security: [{ bearerAuth: [] }],
      summary: "Sensitive admin route",
      tags: ["admin"]
    })
  })
})
