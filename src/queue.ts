import { Data, Effect, ParseResult, Schema } from "effect"
import type { SchemaLike } from "./schema"

export const readQueueCorrelationIds = (
  value: unknown
): { readonly requestId?: string; readonly traceId?: string } => {
  if (typeof value !== "object" || value === null) {
    return {}
  }

  const record = value as Record<string, unknown>

  return {
    ...(typeof record["requestId"] === "string" && record["requestId"].length > 0
      ? { requestId: record["requestId"] }
      : {}),
    ...(typeof record["traceId"] === "string" && record["traceId"].length > 0
      ? { traceId: record["traceId"] }
      : {})
  }
}

export interface QueueMessageEnvelope<Kind extends string, Payload> {
  readonly messageId: string
  readonly kind: Kind
  readonly schemaVersion: number
  readonly payload: Payload
  readonly createdAt: string
  readonly traceId?: string
  readonly requestId?: string
}

export interface QueuePayloadSchema<Kind extends string, Payload, EncodedPayload> {
  readonly kind: Kind
  readonly schemaVersion: number
  readonly payload: SchemaLike<Payload, EncodedPayload>
}

export class QueuePayloadDecodeError extends Data.TaggedError("QueuePayloadDecodeError")<{
  readonly message: string
  readonly issues: readonly string[]
  readonly kind?: string
  readonly messageId?: string
}> {}

export class QueuePayloadEncodeError extends Data.TaggedError("QueuePayloadEncodeError")<{
  readonly message: string
  readonly issues: readonly string[]
  readonly kind?: string
  readonly messageId?: string
}> {}

export const makeQueueMessageEnvelopeSchema = <Kind extends string, Payload, EncodedPayload>(
  options: QueuePayloadSchema<Kind, Payload, EncodedPayload>
) =>
  Schema.Struct({
    messageId: Schema.String,
    kind: Schema.Literal(options.kind),
    schemaVersion: Schema.Literal(options.schemaVersion),
    payload:
      // SAFETY: SchemaLike is the Effect Schema surface without a unique TypeId.
      options.payload as Schema.Schema<Payload, EncodedPayload, never>,
    createdAt: Schema.String,
    traceId: Schema.optional(Schema.String),
    requestId: Schema.optional(Schema.String)
  })

const getStringProperty = (value: unknown, property: string): string | undefined => {
  if (typeof value !== "object" || value === null || !(property in value)) {
    return undefined
  }

  const candidate = (value as Record<string, unknown>)[property]

  return typeof candidate === "string" ? candidate : undefined
}

const makeDecodeError = (
  value: unknown,
  error: ParseResult.ParseError
): QueuePayloadDecodeError => {
  const kind = getStringProperty(value, "kind")
  const messageId = getStringProperty(value, "messageId")

  return new QueuePayloadDecodeError({
    message: "Invalid queue payload",
    issues: [ParseResult.TreeFormatter.formatErrorSync(error)],
    ...(kind === undefined ? {} : { kind }),
    ...(messageId === undefined ? {} : { messageId })
  })
}

const makeEncodeError = (
  value: unknown,
  error: ParseResult.ParseError
): QueuePayloadEncodeError => {
  const kind = getStringProperty(value, "kind")
  const messageId = getStringProperty(value, "messageId")

  return new QueuePayloadEncodeError({
    message: "Invalid queue payload",
    issues: [ParseResult.TreeFormatter.formatErrorSync(error)],
    ...(kind === undefined ? {} : { kind }),
    ...(messageId === undefined ? {} : { messageId })
  })
}

export const decodeQueueMessageEnvelope = <Kind extends string, Payload, EncodedPayload>(
  options: QueuePayloadSchema<Kind, Payload, EncodedPayload>,
  value: unknown
  // SAFETY: consumer Effect.gen can yield this across Effect copies.
): any => {
  const schema = makeQueueMessageEnvelopeSchema(options)

  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.map((message) => message as QueueMessageEnvelope<Kind, Payload>),
    Effect.mapError((error) => makeDecodeError(value, error))
  )
}

export const encodeQueueMessageEnvelope = <Kind extends string, Payload, EncodedPayload>(
  options: QueuePayloadSchema<Kind, Payload, EncodedPayload>,
  envelope: QueueMessageEnvelope<Kind, Payload>
  // SAFETY: consumer Effect.gen can yield this across Effect copies.
): any => {
  const schema = makeQueueMessageEnvelopeSchema(options)

  return Schema.encode(schema)(envelope).pipe(
    Effect.map((message) => message as QueueMessageEnvelope<Kind, EncodedPayload>),
    Effect.mapError((error) => makeEncodeError(envelope, error))
  )
}
