import { Effect, ParseResult, Schema } from "effect"
import { ValidationError } from "./errors"

export type AnySchema = Schema.Schema<unknown, unknown, unknown>

export const decodeUnknown = <A, I>(
  schema: Schema.Schema<A, I, unknown>,
  value: unknown,
  label: string
): Effect.Effect<A, ValidationError> =>
  Schema.decodeUnknown(schema as Schema.Schema<A, I, never>)(value).pipe(
    Effect.mapError(
      (error) =>
        new ValidationError({
          message: `Invalid ${label}`,
          issues: [ParseResult.TreeFormatter.formatErrorSync(error)]
        })
    )
  )

export const encode = <A, I>(
  schema: Schema.Schema<A, I, unknown>,
  value: A,
  label: string
): Effect.Effect<I, ValidationError> =>
  Schema.encode(schema as Schema.Schema<A, I, never>)(value).pipe(
    Effect.mapError(
      (error) =>
        new ValidationError({
          message: `Invalid ${label}`,
          issues: [ParseResult.TreeFormatter.formatErrorSync(error)]
        })
    )
  )
