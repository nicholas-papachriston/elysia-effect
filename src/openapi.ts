import { JSONSchema, type Schema } from "effect"
import type { SchemaLike } from "./schema"

export type EffectOpenApiJsonSchema = JSONSchema.JsonSchema7Root

export interface EffectOpenApiDetail {
  readonly tags?: readonly string[]
  readonly summary?: string
  readonly description?: string
  readonly security?: readonly Record<string, readonly string[]>[]
  readonly responses?: {
    readonly 200: {
      readonly description: string
      readonly content: {
        readonly "application/json": {
          readonly schema: EffectOpenApiJsonSchema
        }
      }
    }
  }
  readonly hide?: boolean
  readonly admin?: boolean
}

export interface EffectRouteOpenApiOptions {
  readonly detail?: EffectOpenApiDetail
  readonly body?: EffectOpenApiJsonSchema
  readonly query?: EffectOpenApiJsonSchema
  readonly params?: EffectOpenApiJsonSchema
  readonly headers?: EffectOpenApiJsonSchema
  readonly cookie?: EffectOpenApiJsonSchema
  readonly response?: {
    readonly 200: EffectOpenApiJsonSchema
  }
}

export const openApiDetail = (detail: EffectOpenApiDetail): EffectRouteOpenApiOptions => ({
  detail: normalizeOpenApiDetail(detail)
})

export const openApiHiddenRoute = (
  detail: Omit<EffectOpenApiDetail, "hide">
): EffectRouteOpenApiOptions =>
  openApiDetail({
    ...detail,
    hide: true
  })

export const openApiAdminRoute = (
  detail: Omit<EffectOpenApiDetail, "admin">
): EffectRouteOpenApiOptions =>
  openApiDetail({
    ...detail,
    admin: true
  })

export const openApiSensitiveAdminRoute = (
  detail: Omit<EffectOpenApiDetail, "admin" | "hide">
): EffectRouteOpenApiOptions =>
  openApiDetail({
    ...detail,
    admin: true,
    hide: true
  })

export interface EffectOpenApiSchemaOptions {
  readonly body?: SchemaLike
  readonly query?: SchemaLike
  readonly params?: SchemaLike
  readonly headers?: SchemaLike
  readonly cookies?: SchemaLike
  readonly response?: SchemaLike
}

const stripJsonSchemaDialect = (schema: EffectOpenApiJsonSchema): EffectOpenApiJsonSchema => {
  const { $schema: _schema, ...openApiSchema } = schema

  return openApiSchema
}

const normalizeOpenApiDetail = (detail: EffectOpenApiDetail): EffectOpenApiDetail => {
  if (!detail.admin) {
    return detail
  }

  return {
    ...detail,
    security: detail.security ?? [{ bearerAuth: [] }]
  }
}

export const toOpenApiJsonSchema = (schema: SchemaLike): EffectOpenApiJsonSchema =>
  stripJsonSchemaDialect(
    JSONSchema.make(
      // SAFETY: SchemaLike is the Effect Schema surface without a unique TypeId.
      schema as Schema.Schema.Any,
      { target: "openApi3.1" }
    )
  )

export const openApiSchemas = (
  schemas: EffectOpenApiSchemaOptions
): Omit<EffectRouteOpenApiOptions, "detail"> => ({
  ...(schemas.body ? { body: toOpenApiJsonSchema(schemas.body) } : {}),
  ...(schemas.query ? { query: toOpenApiJsonSchema(schemas.query) } : {}),
  ...(schemas.params ? { params: toOpenApiJsonSchema(schemas.params) } : {}),
  ...(schemas.headers ? { headers: toOpenApiJsonSchema(schemas.headers) } : {}),
  ...(schemas.cookies ? { cookie: toOpenApiJsonSchema(schemas.cookies) } : {}),
  ...(schemas.response
    ? {
        response: {
          200: toOpenApiJsonSchema(schemas.response)
        }
      }
    : {})
})

export const openApiRouteOptions = (
  schemas: EffectOpenApiSchemaOptions | undefined,
  options: EffectRouteOpenApiOptions = {}
): EffectRouteOpenApiOptions => ({
  ...(schemas ? openApiSchemas(schemas) : {}),
  ...options,
  ...(options.detail ? { detail: normalizeOpenApiDetail(options.detail) } : {})
})
