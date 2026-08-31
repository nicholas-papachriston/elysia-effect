import { Effect } from "effect"
import { Elysia } from "elysia"
import { type AuthContext, RequestContextTag } from "./context"
import { defaultErrorMapper, type HttpErrorResponse } from "./errors"
import {
  anonymousAuth,
  type EffectPluginBindings,
  type EffectTelemetryHooks,
  type ElysiaLikeContext,
  makeRequestContext
} from "./handler"
import { getRequestId } from "./request"
import {
  createEffectRunner,
  type EffectLike,
  type EffectRunner,
  isEffectValue,
  type ObservedExit,
  runObserved
} from "./runtime"
import { readTraceId, TRACE_ID_HEADER } from "./trace"

export interface EffectPluginOptions {
  readonly layer?: object
  readonly mapError?: (error: unknown) => HttpErrorResponse
  readonly auth?: (context: ElysiaLikeContext) => AuthContext | Promise<AuthContext>
  readonly telemetry?: EffectTelemetryHooks
}

const responseFromMappedError = (
  error: unknown,
  mapError: (error: unknown) => HttpErrorResponse
) => {
  const mapped = mapError(error)

  return new Response(JSON.stringify(mapped.body), {
    status: mapped.status,
    headers: {
      "content-type": "application/json"
    }
  })
}

const valueFromObserved = <A>(
  observed: ObservedExit<A, unknown>,
  mapError: (error: unknown) => HttpErrorResponse,
  setStatus?: (status: number) => void
): A | HttpErrorResponse["body"] | undefined => {
  switch (observed.kind) {
    case "success":
      return observed.value
    case "interrupt":
      return undefined
    case "failure":
    case "defect": {
      const mapped = mapError(observed.error)
      setStatus?.(mapped.status)
      return mapped.body
    }
    default: {
      const exhaustive: never = observed
      return exhaustive
    }
  }
}

const runDecoratorProgram = async <A, E, Requirements>(
  runner: EffectRunner<Requirements>,
  program: EffectLike<A, E, Requirements>,
  mapError: (error: unknown) => HttpErrorResponse
) => {
  const observed = await runObserved(runner, program, new AbortController().signal)

  if (observed.kind === "failure" || observed.kind === "defect") {
    throw responseFromMappedError(observed.error, mapError)
  }

  return valueFromObserved(observed, mapError)
}

export const effectPlugin = <Requirements = never>(options: EffectPluginOptions = {}) => {
  const mapError = options.mapError ?? defaultErrorMapper
  const runner = createEffectRunner<Requirements>(options.layer)
  const bindings: EffectPluginBindings<Requirements> = {
    runner,
    mapError,
    ...(options.auth ? { auth: options.auth } : {}),
    ...(options.telemetry ? { telemetry: options.telemetry } : {})
  }

  return new Elysia({ name: "elysia-effect" })
    .decorate("elysiaEffect", bindings)
    .decorate("runEffect", async <A, E>(program: EffectLike<A, E, Requirements>) =>
      runDecoratorProgram(runner, program, mapError)
    )
    .onAfterHandle(async (context) => {
      const response = (context as { readonly response?: unknown }).response
      if (!isEffectValue(response)) {
        return response
      }

      const elysiaContext = context as unknown as ElysiaLikeContext
      const requestId = getRequestId(elysiaContext)
      const startEvent = {
        requestId,
        traceId: readTraceId(context.request.headers, requestId),
        method: context.request.method,
        path: new URL(context.request.url).pathname
      }
      elysiaContext.set.headers = {
        ...elysiaContext.set.headers,
        "x-request-id": requestId,
        [TRACE_ID_HEADER]: startEvent.traceId
      }
      const auth = options.auth ? await Promise.resolve(options.auth(elysiaContext)) : anonymousAuth
      const provided = response.pipe(
        Effect.provideService(
          RequestContextTag,
          makeRequestContext(elysiaContext, startEvent, auth)
        )
      )
      const observed = await runObserved(
        runner as EffectRunner<never>,
        provided as Effect.Effect<unknown, unknown, never>,
        context.request.signal
      )

      return valueFromObserved(observed, mapError, (status) => {
        elysiaContext.set.status = status
      })
    })
    .as("scoped")
}
