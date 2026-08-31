import { Effect, Exit, Stream } from "effect"
import { defaultErrorMapper, type HttpErrorResponse } from "./errors"
import type { EffectLike } from "./runtime"

export interface StreamLike<out A = unknown, out E = unknown, out R = unknown> {
  readonly pipe: (...args: readonly unknown[]) => unknown
  readonly _A?: A
  readonly _E?: E
  readonly _R?: R
}

const asStream = <A, E, R>(stream: StreamLike<A, E, R>): Stream.Stream<A, E, R> =>
  // SAFETY: Consumer Stream values share the Stream protocol across copies.
  stream as Stream.Stream<A, E, R>

const asEffect = <A, E, R>(program: EffectLike<A, E, R>): Effect.Effect<A, E, R> =>
  // SAFETY: Consumer Effect values share the Effect protocol across copies.
  program as Effect.Effect<A, E, R>

export type StreamInterruptionReason = "abort" | "cancel" | "error"

export interface StreamInterruptionEvent {
  readonly reason: StreamInterruptionReason
  readonly error?: unknown
}

export interface StreamLifecycleOptions<A> {
  readonly signal?: AbortSignal
  readonly strategy?: QueuingStrategy<A>
  readonly onComplete?: () => void | Promise<void>
  readonly onInterrupt?: (event: StreamInterruptionEvent) => void | Promise<void>
}

export interface ServerSentEvent {
  readonly id?: string
  readonly event?: string
  readonly retry?: number
  readonly data?: unknown
}

export interface SseStreamResponseOptions<A> extends StreamLifecycleOptions<Uint8Array> {
  readonly event: (chunk: A) => ServerSentEvent
  readonly headers?: HeadersInit
  readonly mapError?: (error: unknown) => HttpErrorResponse
}

const encoder = new TextEncoder()

const runHook = (hook: () => void | Promise<void>): Effect.Effect<void> =>
  Effect.promise(async () => {
    await hook()
  }).pipe(Effect.catchAllCause(() => Effect.void))

const waitForAbort = (signal: AbortSignal): Effect.Effect<void> => {
  if (signal.aborted) {
    return Effect.void
  }

  return Effect.async<void>((resume) => {
    let settled = false
    const onAbort = () => {
      if (settled) {
        return
      }

      settled = true
      signal.removeEventListener("abort", onAbort)
      resume(Effect.void)
    }

    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
    }

    return Effect.sync(() => {
      settled = true
      signal.removeEventListener("abort", onAbort)
    })
  })
}

const withStreamLifecycle = <A, E, R>(
  stream: Stream.Stream<A, E, R>,
  options: StreamLifecycleOptions<A> = {}
): Stream.Stream<A, E, R> => {
  let interrupted = false

  const interruptOnce = (event: StreamInterruptionEvent): Effect.Effect<void> =>
    Effect.suspend(() => {
      if (interrupted) {
        return Effect.void
      }

      const hook = options.onInterrupt

      interrupted = true
      return hook ? runHook(() => hook(event)) : Effect.void
    })

  const streamWithAbort =
    options.signal === undefined
      ? stream
      : stream.pipe(
          Stream.interruptWhen(
            waitForAbort(options.signal).pipe(Effect.tap(() => interruptOnce({ reason: "abort" })))
          )
        )

  return streamWithAbort.pipe(
    Stream.tapError((error) => interruptOnce({ reason: "error", error })),
    Stream.ensuringWith((exit) => {
      if (Exit.isSuccess(exit)) {
        return interrupted || options.signal?.aborted === true || options.onComplete === undefined
          ? Effect.void
          : runHook(options.onComplete)
      }

      return interruptOnce({
        reason: Exit.isInterrupted(exit)
          ? options.signal?.aborted === true
            ? "abort"
            : "cancel"
          : "error"
      })
    })
  )
}

const stringifySseData = (data: unknown): string =>
  typeof data === "string" ? data : JSON.stringify(data)

export const encodeServerSentEvent = (event: ServerSentEvent): string => {
  const lines: string[] = []

  if (event.id !== undefined) {
    lines.push(`id: ${event.id}`)
  }

  if (event.event !== undefined) {
    lines.push(`event: ${event.event}`)
  }

  if (event.retry !== undefined) {
    lines.push(`retry: ${event.retry}`)
  }

  if (event.data !== undefined) {
    for (const line of stringifySseData(event.data).split(/\r?\n/)) {
      lines.push(`data: ${line}`)
    }
  }

  return `${lines.join("\n")}\n\n`
}

export const streamToReadableStream = <A, E>(
  stream: StreamLike<A, E, never>,
  options: StreamLifecycleOptions<A> = {}
): ReadableStream<A> =>
  Stream.toReadableStream(withStreamLifecycle(asStream(stream), options), {
    strategy: options.strategy
  })

export const streamToReadableStreamEffect = <A, E, R>(
  stream: StreamLike<A, E, R>,
  options: StreamLifecycleOptions<A> = {}
  // SAFETY: consumer Effect.gen can yield this across Effect copies.
): any =>
  Stream.toReadableStreamEffect(withStreamLifecycle(asStream(stream), options), {
    strategy: options.strategy
  })

export const sseStreamResponse = <A, E, R>(
  stream: StreamLike<A, E, R>,
  options: SseStreamResponseOptions<A> & {
    readonly beforeStream?: EffectLike<void, E, R>
  }
  // SAFETY: consumer Effect.gen can yield this across Effect copies.
): any => {
  const mapError = options.mapError ?? defaultErrorMapper

  return Effect.gen(function* () {
    if (options.beforeStream !== undefined) {
      const gate = yield* Effect.either(asEffect(options.beforeStream))

      if (gate._tag === "Left") {
        const mapped = mapError(gate.left)
        const init: ResponseInit = {
          status: mapped.status,
          ...(options.headers ? { headers: options.headers } : {})
        }

        return Response.json(mapped.body, init)
      }
    }

    const lifecycleOptions: StreamLifecycleOptions<A> = {
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.onComplete ? { onComplete: options.onComplete } : {}),
      ...(options.onInterrupt ? { onInterrupt: options.onInterrupt } : {})
    }

    const body = yield* Stream.toReadableStreamEffect(
      withStreamLifecycle(asStream(stream), lifecycleOptions).pipe(
        Stream.map((chunk) => encoder.encode(encodeServerSentEvent(options.event(chunk)))),
        Stream.catchAll((error) =>
          Stream.make(
            encoder.encode(
              encodeServerSentEvent({
                event: "error",
                data: mapError(error).body
              })
            )
          )
        )
      ),
      { strategy: options.strategy }
    )

    return new Response(body, {
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        ...options.headers
      }
    })
  })
}
