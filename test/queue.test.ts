import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import {
  decodeQueueMessageEnvelope,
  encodeQueueMessageEnvelope,
  QueuePayloadDecodeError,
  QueuePayloadEncodeError
} from "../src/queue"

const ChatPayload = Schema.Struct({
  prompt: Schema.String,
  tokenBudget: Schema.Number.pipe(Schema.int())
})

const chatPayloadSchema = {
  kind: "chat.message" as const,
  schemaVersion: 2,
  payload: ChatPayload
}

describe("queue payload helpers", () => {
  test("round-trips a valid payload envelope", async () => {
    const envelope = {
      messageId: "message-1",
      kind: "chat.message" as const,
      schemaVersion: 2,
      payload: {
        prompt: "Say hello",
        tokenBudget: 128
      },
      createdAt: "2026-05-12T08:00:00.000Z",
      traceId: "trace-1",
      requestId: "request-1"
    }

    const encoded = await Effect.runPromise(encodeQueueMessageEnvelope(chatPayloadSchema, envelope))
    const decoded = await Effect.runPromise(decodeQueueMessageEnvelope(chatPayloadSchema, encoded))

    expect(decoded).toEqual(envelope)
  })

  test("returns a typed validation error for invalid payloads", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        decodeQueueMessageEnvelope(chatPayloadSchema, {
          messageId: "message-1",
          kind: "chat.message",
          schemaVersion: 2,
          payload: {
            prompt: "Say hello",
            tokenBudget: "128"
          },
          createdAt: "2026-05-12T08:00:00.000Z"
        })
      )
    )

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(QueuePayloadDecodeError)
      expect(result.left._tag).toBe("QueuePayloadDecodeError")
      expect(result.left.kind).toBe("chat.message")
      expect(result.left.messageId).toBe("message-1")
      expect(result.left.issues.join("\n")).toContain("tokenBudget")
    }
  })

  test("returns a typed validation error for invalid encoded payloads", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        encodeQueueMessageEnvelope(chatPayloadSchema, {
          messageId: "message-1",
          kind: "chat.message",
          schemaVersion: 2,
          payload: {
            prompt: "Say hello",
            tokenBudget: 1.5
          },
          createdAt: "2026-05-12T08:00:00.000Z"
        })
      )
    )

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(QueuePayloadEncodeError)
      expect(result.left._tag).toBe("QueuePayloadEncodeError")
      expect(result.left.kind).toBe("chat.message")
      expect(result.left.messageId).toBe("message-1")
      expect(result.left.issues.join("\n")).toContain("tokenBudget")
    }
  })

  test("preserves schema version", async () => {
    const decoded = await Effect.runPromise(
      decodeQueueMessageEnvelope(chatPayloadSchema, {
        messageId: "message-1",
        kind: "chat.message",
        schemaVersion: 2,
        payload: {
          prompt: "Say hello",
          tokenBudget: 128
        },
        createdAt: "2026-05-12T08:00:00.000Z"
      })
    )

    expect(decoded.schemaVersion).toBe(2)
  })

  test("preserves request ID", async () => {
    const decoded = await Effect.runPromise(
      decodeQueueMessageEnvelope(chatPayloadSchema, {
        messageId: "message-1",
        kind: "chat.message",
        schemaVersion: 2,
        payload: {
          prompt: "Say hello",
          tokenBudget: 128
        },
        createdAt: "2026-05-12T08:00:00.000Z",
        requestId: "request-1"
      })
    )

    expect(decoded.requestId).toBe("request-1")
  })
})
