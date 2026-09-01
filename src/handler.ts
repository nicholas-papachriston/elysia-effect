import { Effect } from "effect"
import { type AuthContext, type RequestContext, RequestContextTag, type RequestId } from "./context"
import { defaultErrorMapper, type HttpErrorResponse, type ValidationError } from "./errors"
import {
  cookiesToObject,
  emptyObject,
  getRequestId,
  headersToObject,
  readClientMeta
} from "./request"
import { createEffectRunner, type EffectLike, type EffectRunner, runObserved } from "./runtime"
import { decodeUnknown, encode, type SchemaLike } from "./schema"
import { readTraceId, TRACE_ID_HEADER } from "./trace"

export interface EffectRouteSchemas {
  readonly body?: SchemaLike
  readonly query?: SchemaLike
  readonly params?: SchemaLike
  readonly headers?: SchemaLike
  readonly cookies?: SchemaLike
  readonly response?: SchemaLike
}

export interface EffectHandlerContext<Body, Query, Params, Headers, Cookies> {
  readonly request: Request
  readonly requestId: RequestId
  readonly traceId: string
  readonly auth: AuthContext
  readonly set: ElysiaLikeContext["set"]
  readonly body: Body
  readonly query: Query
  readonly params: Params
  readonly headers: Headers
  readonly cookies: Cookies
  readonly abortSignal: AbortSignal
  readonly clientIp?: string
  readonly userAgent?: string
  readonly rawBody?: string
}

export interface EffectTelemetryHooks {
  readonly onStart?: (event: EffectRequestStartEvent) => void
  readonly onSuccess?: (event: EffectRequestSuccessEvent) => void
  readonly onError?: (event: EffectRequestErrorEvent) => void
}

export interface EffectRequestStartEvent {
  readonly requestId: RequestId
  readonly traceId: string
  readonly method: string
  readonly path: string
}

export interface EffectRequestSuccessEvent extends EffectRequestStartEvent {
  readonly durationMs: number
}

export interface EffectRequestErrorEvent extends EffectRequestStartEvent {
  readonly durationMs: number
  readonly error: unknown
}

export interface EffectBindings<Requirements = never> {
  readonly runner: EffectRunner<Requirements>
  readonly mapError: (error: unknown) => HttpErrorResponse
  readonly auth?: (context: ElysiaLikeContext) => AuthContext | Promise<AuthContext>
  readonly telemetry?: EffectTelemetryHooks
}

export interface EffectHandlerOptions<
  _Body = Record<string, never>,
  _Query = Record<string, never>,
  _Params = Record<string, never>,
  _RequestHeaders = Record<string, string>,
  _RequestCookies = Record<string, string>,
  _ResponseBody = unknown,
  _Requirements = never
> {
  readonly schemas?: EffectRouteSchemas
  readonly layer?: object
  readonly mapError?: (error: unknown) => HttpErrorResponse
  readonly auth?: (context: ElysiaLikeContext) => AuthContext | Promise<AuthContext>
  readonly telemetry?: EffectTelemetryHooks
  readonly rawBody?: boolean
}

export interface ElysiaLikeContext {
  readonly request: Request
  readonly body?: unknown
  readonly query?: unknown
  readonly params?: unknown
  readonly headers?: Record<string, string | undefined>
  readonly cookie?: Record<string, { readonly value: unknown } | string | undefined>
  readonly requestAuth?: AuthContext
  readonly effect?: EffectBindings
  readonly set: {
    status?: number | string
    headers?: Record<string, string | number>
  }
}

export const anonymousAuth: AuthContext = {
  isAdmin: false,
  isEmailVerified: false
}

export const authFromHeaders = (context: ElysiaLikeContext): AuthContext => {
  const userId = context.request.headers.get("x-effect-user-id")
  const isAdmin = context.request.headers.get("x-effect-admin") === "true"
  const isEmailVerified = context.request.headers.get("x-effect-email-verified") === "true"

  return {
    ...(userId ? { userId } : {}),
    isAdmin,
    isEmailVerified
  }
}

export const TRUSTED_AUTH_HEADER = "x-effect-trusted-auth"

/**
 * PRECONDITION: callers must strip all client-supplied identity headers at the
 * public boundary and set these headers only after real session/bearer validation.
 * Without that upstream validation, this is not safer than authFromHeaders.
 */
export const trustedAuthFromHeaders = (context: ElysiaLikeContext): AuthContext => {
  if (context.request.headers.get(TRUSTED_AUTH_HEADER) !== "true") {
    return anonymousAuth
  }

  return authFromHeaders(context)
}

const decodeOptional = <A>(
  schema: SchemaLike | undefined,
  value: unknown,
  label: string,
  fallback: A
): Effect.Effect<A, ValidationError> =>
  schema === undefined
    ? Effect.succeed(fallback)
    : decodeUnknown(schema as SchemaLike<A>, value, label)

const createStartEvent = (
  context: ElysiaLikeContext,
  requestId: RequestId
): EffectRequestStartEvent => ({
  requestId,
  traceId: readTraceId(context.request.headers, requestId),
  method: context.request.method,
  path: new URL(context.request.url).pathname
})

const resolveAuth = async (
  context: ElysiaLikeContext,
  routeAuth: EffectHandlerOptions["auth"]
): Promise<AuthContext> => {
  const auth = routeAuth ?? context.effect?.auth
  if (auth === undefined) {
    return anonymousAuth
  }

  return Promise.resolve(auth(context))
}

const applyCorrelationHeaders = (
  context: ElysiaLikeContext,
  startEvent: EffectRequestStartEvent
) => {
  context.set.headers = {
    ...context.set.headers,
    "x-request-id": startEvent.requestId,
    [TRACE_ID_HEADER]: startEvent.traceId
  }
}

export const makeRequestContext = (
  context: ElysiaLikeContext,
  startEvent: EffectRequestStartEvent,
  auth: AuthContext
): RequestContext => {
  const clientMeta = readClientMeta(context.request)

  return {
    requestId: startEvent.requestId,
    request: context.request,
    auth,
    headers: headersToObject(context.request),
    cookies: cookiesToObject(context),
    abortSignal: context.request.signal,
    ...clientMeta
  }
}

const writeObservedResult = <A>(
  context: ElysiaLikeContext,
  startEvent: EffectRequestStartEvent,
  startedAt: number,
  telemetry: EffectTelemetryHooks | undefined,
  mapError: (error: unknown) => HttpErrorResponse,
  observed: Awaited<ReturnType<typeof runObserved<A, unknown, never>>>
): A | HttpErrorResponse["body"] | undefined => {
  switch (observed.kind) {
    case "success":
      telemetry?.onSuccess?.({
        ...startEvent,
        durationMs: performance.now() - startedAt
      })
      return observed.value
    case "failure":
    case "defect": {
      const error = observed.error
      const mapped = mapError(error)
      context.set.status = mapped.status
      telemetry?.onError?.({
        ...startEvent,
        durationMs: performance.now() - startedAt,
        error
      })
      return mapped.body
    }
    case "interrupt":
      return undefined
    default: {
      const exhaustive: never = observed
      return exhaustive
    }
  }
}

export const createEffectHandler =
  <
    Body = Record<string, never>,
    Query = Record<string, never>,
    Params = Record<string, never>,
    RequestHeaders = Record<string, string>,
    RequestCookies = Record<string, string>,
    ResponseBody = unknown,
    Requirements = never
  >(
    options: EffectHandlerOptions<
      Body,
      Query,
      Params,
      RequestHeaders,
      RequestCookies,
      ResponseBody,
      Requirements
    >,
    handler: (
      context: EffectHandlerContext<Body, Query, Params, RequestHeaders, RequestCookies>
    ) => EffectLike<ResponseBody, unknown, Requirements | RequestContextTag>
  ) =>
  async (context: ElysiaLikeContext): Promise<unknown> => {
    const plugin = context.effect
    const mapError = options.mapError ?? plugin?.mapError ?? defaultErrorMapper
    const telemetry = options.telemetry ?? plugin?.telemetry
    const runner = options.layer
      ? createEffectRunner(options.layer)
      : (plugin?.runner ?? createEffectRunner())
    const requestId = getRequestId(context)
    const auth = await resolveAuth(context, options.auth)
    const startedAt = performance.now()
    const startEvent = createStartEvent(context, requestId)
    telemetry?.onStart?.(startEvent)
    applyCorrelationHeaders(context, startEvent)
    const clientMeta = readClientMeta(context.request)
    const rawBody = options.rawBody ? await context.request.clone().text() : undefined

    const program = Effect.gen(function* () {
      const body = yield* decodeOptional(
        options.schemas?.body,
        options.rawBody ? rawBody : context.body,
        "request body",
        emptyObject as Body
      )
      const query = yield* decodeOptional(
        options.schemas?.query,
        context.query ?? emptyObject,
        "query",
        emptyObject as Query
      )
      const params = yield* decodeOptional(
        options.schemas?.params,
        context.params ?? emptyObject,
        "params",
        emptyObject as Params
      )
      const headers = yield* decodeOptional(
        options.schemas?.headers,
        headersToObject(context.request),
        "headers",
        headersToObject(context.request) as RequestHeaders
      )
      const cookies = yield* decodeOptional(
        options.schemas?.cookies,
        cookiesToObject(context),
        "cookies",
        cookiesToObject(context) as RequestCookies
      )
      const requestContext = makeRequestContext(context, startEvent, auth)
      const handlerContext: EffectHandlerContext<
        Body,
        Query,
        Params,
        RequestHeaders,
        RequestCookies
      > = {
        request: context.request,
        requestId,
        traceId: startEvent.traceId,
        auth,
        set: context.set,
        body,
        query,
        params,
        headers,
        cookies,
        abortSignal: context.request.signal,
        ...clientMeta,
        ...(rawBody === undefined ? {} : { rawBody })
      }

      const result = yield* (
        handler(handlerContext) as Effect.Effect<
          ResponseBody,
          unknown,
          Requirements | RequestContextTag
        >
      ).pipe(Effect.provideService(RequestContextTag, requestContext))

      return options.schemas?.response
        ? yield* encode(options.schemas.response as SchemaLike<ResponseBody>, result, "response")
        : result
    })

    const observed = await runObserved(
      runner as EffectRunner<never>,
      program as Effect.Effect<unknown, unknown, never>,
      context.request.signal
    )

    return writeObservedResult(context, startEvent, startedAt, telemetry, mapError, observed)
  }
