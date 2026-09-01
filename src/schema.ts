import { Effect, ParseResult, Schema } from "effect"
import { ValidationError } from "./errors"

/**
 * Structural Effect Schema. This avoids unique `TypeId` mismatches when a
 * consumer hoists a different Effect copy than the one this package compiled
 * against.
 */
export interface SchemaLike<out A = unknown, out I = unknown> {
  readonly ast: unknown
  readonly Type?: A
  readonly Encoded?: I
}

export type AnySchema = SchemaLike<unknown, unknown>

export type InferSchemaType<S> = S extends { readonly Type?: infer A } ? NonNullable<A> : unknown

export type InferSchemaEncoded<S> = S extends { readonly Encoded?: infer I }
  ? NonNullable<I>
  : unknown

const asEffectSchema = <A, I>(schema: SchemaLike<A, I>): Schema.Schema<A, I, never> =>
  // SAFETY: SchemaLike is the Effect Schema surface without a unique TypeId.
  schema as Schema.Schema<A, I, never>

export const toStandardSchema = <A, I>(schema: SchemaLike<A, I>) =>
  Schema.standardSchemaV1(asEffectSchema(schema))

export interface ElysiaValidatorOptions {
  readonly body?: SchemaLike
  readonly query?: SchemaLike
  readonly params?: SchemaLike
  readonly headers?: SchemaLike
  readonly cookies?: SchemaLike
  readonly response?: SchemaLike
}

export const toElysiaValidator = (schemas: ElysiaValidatorOptions) => ({
  ...(schemas.body ? { body: toStandardSchema(schemas.body) } : {}),
  ...(schemas.query ? { query: toStandardSchema(schemas.query) } : {}),
  ...(schemas.params ? { params: toStandardSchema(schemas.params) } : {}),
  ...(schemas.headers ? { headers: toStandardSchema(schemas.headers) } : {}),
  ...(schemas.cookies ? { cookie: toStandardSchema(schemas.cookies) } : {}),
  ...(schemas.response ? { response: toStandardSchema(schemas.response) } : {})
})

export const decodeUnknown = <A, I>(
  schema: SchemaLike<A, I>,
  value: unknown,
  label: string
): Effect.Effect<A, ValidationError> =>
  Schema.decodeUnknown(asEffectSchema(schema))(value).pipe(
    Effect.mapError(
      (error) =>
        new ValidationError({
          message: `Invalid ${label}`,
          issues: [ParseResult.TreeFormatter.formatErrorSync(error)]
        })
    )
  )

export const encode = <A, I>(
  schema: SchemaLike<A, I>,
  value: A,
  label: string
): Effect.Effect<I, ValidationError> =>
  Schema.encode(asEffectSchema(schema))(value).pipe(
    Effect.mapError(
      (error) =>
        new ValidationError({
          message: `Invalid ${label}`,
          issues: [ParseResult.TreeFormatter.formatErrorSync(error)]
        })
    )
  )
