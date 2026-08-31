import { describe, expect, test } from "bun:test"
import { Data, Effect, Stream } from "effect"
import type { StreamInterruptionEvent } from "../src/stream"
import { encodeServerSentEvent, sseStreamResponse, streamToReadableStream } from "../src/stream"

const readAll = async <A>(stream: ReadableStream<A>): Promise<A[]> => {
  const reader = stream.getReader()
  const chunks: A[] = []

  try {
    while (true) {
      const result = await reader.read()

      if (result.done) {
        return chunks
      }

      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
}

const rejectAfter = (ms: number): Promise<never> =>
  new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
  })

class EligibilityError extends Data.TaggedError("EligibilityError")<{
  readonly message: string
  readonly reason: "email_verification_required"
}> {}

describe("stream helpers", () => {
  test("emits chunks in order", async () => {
    const stream = streamToReadableStream(Stream.fromIterable(["first", "second", "third"]))

    await expect(readAll(stream)).resolves.toEqual(["first", "second", "third"])
  })

  test("formats SSE events correctly", () => {
    expect(
      encodeServerSentEvent({
        id: "message-1",
        event: "chat.delta",
        retry: 1000,
        data: "hello\nworld"
      })
    ).toBe("id: message-1\nevent: chat.delta\nretry: 1000\ndata: hello\ndata: world\n\n")
  })

  test("interrupts a stream when the request aborts", async () => {
    const controller = new AbortController()
    const interruptions: StreamInterruptionEvent[] = []
    const stream = streamToReadableStream(
      Stream.fromEffect(Effect.sleep(60_000).pipe(Effect.as("late"))),
      {
        signal: controller.signal,
        onInterrupt: (event) => {
          interruptions.push(event)
        }
      }
    )
    const reader = stream.getReader()
    const read = reader.read()

    controller.abort()

    await expect(Promise.race([read, rejectAfter(250)])).resolves.toEqual({
      done: true,
      value: undefined
    })
    expect(interruptions).toEqual([{ reason: "abort" }])
  })

  test("fires the completion hook once", async () => {
    let completions = 0
    const stream = streamToReadableStream(Stream.fromIterable(["done"]), {
      onComplete: () => {
        completions += 1
      }
    })

    await expect(readAll(stream)).resolves.toEqual(["done"])
    expect(completions).toBe(1)
  })

  test("fires the interruption hook once", async () => {
    let interruptions = 0
    const stream = streamToReadableStream(Stream.fail(new Error("boom")), {
      onInterrupt: () => {
        interruptions += 1
      }
    })
    const reader = stream.getReader()

    await expect(reader.read()).rejects.toThrow("boom")
    expect(interruptions).toBe(1)
  })

  test("maps stream errors to sanitized SSE events", async () => {
    const response = await Effect.runPromise(
      sseStreamResponse(Stream.fail(new Error("raw provider payload")), {
        event: (chunk: string) => ({ event: "chat.delta", data: chunk })
      })
    )
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(text).toBe(
      'event: error\ndata: {"code":"internal_error","message":"Internal server error"}\n\n'
    )
    expect(text).not.toContain("raw provider payload")
  })

  test("runs preflight checks before opening an SSE stream", async () => {
    const response = await Effect.runPromise(
      sseStreamResponse(Stream.fromIterable(["should-not-stream"]), {
        beforeStream: Effect.fail(
          new EligibilityError({
            message: "Email verification required",
            reason: "email_verification_required"
          })
        ),
        event: (chunk) => ({ event: "chat.delta", data: chunk })
      })
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      code: "email_verification_required",
      message: "Email verification required"
    })
  })

  test("maps mid-stream failures after earlier chunks using the default mapper", async () => {
    const response = await Effect.runPromise(
      sseStreamResponse(
        Stream.fromIterable(["first"]).pipe(
          Stream.concat(
            Stream.fail(
              new EligibilityError({ message: "Region blocked", reason: "region_blocked" })
            )
          )
        ),
        {
          event: (chunk: string) => ({ event: "chat.delta", data: chunk })
        }
      )
    )
    const text = await response.text()

    expect(text).toContain("event: chat.delta\ndata: first")
    expect(text).toContain(
      'event: error\ndata: {"code":"region_blocked","message":"Region blocked"}'
    )
  })

  test("uses a custom mapError when streaming fails", async () => {
    const response = await Effect.runPromise(
      sseStreamResponse(Stream.fail(new Error("provider secret")), {
        mapError: () => ({
          status: 418,
          body: { code: "custom_teapot", message: "Mapped stream failure" }
        }),
        event: (chunk: string) => ({ event: "chat.delta", data: chunk })
      })
    )

    const text = await response.text()
    expect(text).toBe(
      'event: error\ndata: {"code":"custom_teapot","message":"Mapped stream failure"}\n\n'
    )
    expect(text).not.toContain("provider secret")
  })

  test("maps preflight failures through a custom mapError", async () => {
    const response = await Effect.runPromise(
      sseStreamResponse(Stream.fromIterable(["ignored"]), {
        beforeStream: Effect.fail(new Error("preflight failed")),
        mapError: () => ({
          status: 503,
          body: { code: "stream_unavailable", message: "Preflight blocked" }
        }),
        event: (chunk) => ({ event: "chat.delta", data: chunk })
      })
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      code: "stream_unavailable",
      message: "Preflight blocked"
    })
  })

  test("reports cancel interruptions when the readable stream consumer stops early", async () => {
    const interruptions: StreamInterruptionEvent[] = []
    const stream = streamToReadableStream(
      Stream.fromEffect(Effect.sleep(60_000).pipe(Effect.as("late"))),
      {
        onInterrupt: (event) => {
          interruptions.push(event)
        }
      }
    )
    const reader = stream.getReader()

    await reader.cancel("consumer-done")
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(interruptions).toEqual([{ reason: "cancel" }])
  })
})
