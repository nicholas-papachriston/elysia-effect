import { Effect, type Layer, type Schema } from "effect"
import { type AuthContext, type RequestContext, RequestContextTag, type RequestId } from "./context"
import { defaultErrorMapper, type HttpErrorResponse } from "./errors"
import { decodeUnknown, encode } from "./schema"
import { readTraceId, TRACE_ID_HEADER } from "./trace"

export interface EffectRouteSchemas {
  readonly body?: Schema.Schema.Any
  readonly query?: Schema.Schema.Any
  readonly params?: Schema.Schema.Any
  readonly headers?: Schema.Schema.Any
  readonly cookies?: Schema.Schema.Any
  readonly response?: Schema.Schema.Any
}

export interface EffectHandlerContext<Body, Query, Params, Headers, Cookies> {
  readonly request: Request
  readonly requestId: RequestId
  readonly auth: AuthContext
  readonly set: ElysiaLikeContext["set"]
  readonly body: Body
  readonly query: Query
  readonly params: Params
  readonly headers: Headers
  readonly cookies: Cookies
  readonly abortSignal: AbortSignal
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

export interface EffectHandlerOptions<
  _Body,
  _Query,
  _Params,
  _Headers,
  _Cookies,
  _ResponseBody,
  Requirements
> {
  readonly schemas?: EffectRouteSchemas
  readonly layer?: Layer.Layer<Requirements, never, unknown>
  readonly mapError?: (error: unknown) => HttpErrorResponse
  readonly auth?: (context: ElysiaLikeContext) => AuthContext | Promise<AuthContext>
  readonly telemetry?: EffectTelemetryHooks
}

export interface ElysiaLikeContext {
  readonly request: Request
  readonly body?: unknown
  readonly query?: unknown
  readonly params?: unknown
  readonly headers?: Record<string, string | undefined>
  readonly cookie?: Record<string, { readonly value: unknown } | string | undefined>
  readonly requestAuth?: AuthContext
  readonly set: {
    status?: number | string
    headers?: Record<string, string | number>
  }
}

const emptyObject = {}

const getRequestId = (context: ElysiaLikeContext): RequestId => {
  const incoming = context.headers?.["x-request-id"] ?? context.request.headers.get("x-request-id")
  return (incoming ?? crypto.randomUUID()) as RequestId
}

const makeRequestContext = <Body, Query, Params, RequestHeaders, RequestCookies>(
  context: ElysiaLikeContext,
  requestId: RequestId,
  body: Body,
  query: Query,
  params: Params,
  headers: RequestHeaders,
  cookies: RequestCookies,
  auth: AuthContext
): EffectHandlerContext<Body, Query, Params, RequestHeaders, RequestCookies> => ({
  request: context.request,
  requestId,
  auth,
  set: context.set,
  body,
  query,
  params,
  headers,
  cookies,
  abortSignal: context.request.signal
})

export const anonymousAuth: AuthContext = {
  isAdmin: false,
  isEmailVerified: false
}

export const authFromHeaders = (context: ElysiaLikeContext): AuthContext => {
  const userId = context.request.headers.get("x-elaris-user-id")
  const isAdmin = context.request.headers.get("x-elaris-admin") === "true"
  const isEmailVerified = context.request.headers.get("x-elaris-email-verified") === "true"

  return {
    ...(userId ? { userId } : {}),
    isAdmin,
    isEmailVerified
  }
}

export const TRUSTED_AUTH_HEADER = "x-elaris-trusted-auth"

/**
 * PRECONDITION: callers must strip all client-supplied Elaris auth headers at the
 * public boundary and set these headers only after real session/bearer validation.
 * Without that upstream validation, this is not safer than authFromHeaders.
 */
export const trustedAuthFromHeaders = (context: ElysiaLikeContext): AuthContext => {
  if (context.request.headers.get(TRUSTED_AUTH_HEADER) !== "true") {
    return anonymousAuth
  }

  return authFromHeaders(context)
}

const headersToObject = (request: Request): Record<string, string> =>
  Object.fromEntries(request.headers.entries())

const parseCookieHeader = (cookieHeader: string | null): Record<string, string> => {
  if (!cookieHeader) {
    return {}
  }

  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => {
        const separator = part.indexOf("=")

        if (separator === -1) {
          return [part, ""]
        }

        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))]
      })
  )
}

const cookiesToObject = (context: ElysiaLikeContext): Record<string, string> => {
  if (!context.cookie) {
    return parseCookieHeader(context.request.headers.get("cookie"))
  }

  return Object.fromEntries(
    Object.entries(context.cookie).flatMap(([name, cookie]) => {
      if (cookie === undefined) {
        return []
      }

      if (typeof cookie === "string") {
        return [[name, cookie]]
      }

      return typeof cookie.value === "string" ? [[name, cookie.value]] : []
    })
  )
}

const createStartEvent = (
  context: ElysiaLikeContext,
  requestId: RequestId
): EffectRequestStartEvent => ({
  requestId,
  traceId: readTraceId(context.request.headers, requestId),
  method: context.request.method,
  path: new URL(context.request.url).pathname
})

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
    ) => Effect.Effect<ResponseBody, unknown, Requirements | RequestContextTag>
  ) =>
  async (context: ElysiaLikeContext): Promise<unknown> => {
    const mapError = options.mapError ?? defaultErrorMapper
    const requestId = getRequestId(context)
    const auth =
      options.auth === undefined ? anonymousAuth : await Promise.resolve(options.auth(context))
    const startedAt = performance.now()
    const startEvent = createStartEvent(context, requestId)
    options.telemetry?.onStart?.(startEvent)
    context.set.headers = {
      ...context.set.headers,
      "x-request-id": requestId,
      [TRACE_ID_HEADER]: startEvent.traceId
    }

    const program = Effect.gen(function* () {
      const body = options.schemas?.body
        ? ((yield* decodeUnknown(options.schemas.body, context.body, "request body")) as Body)
        : (emptyObject as Body)
      const query = options.schemas?.query
        ? ((yield* decodeUnknown(
            options.schemas.query,
            context.query ?? emptyObject,
            "query"
          )) as Query)
        : (emptyObject as Query)
      const params = options.schemas?.params
        ? ((yield* decodeUnknown(
            options.schemas.params,
            context.params ?? emptyObject,
            "params"
          )) as Params)
        : (emptyObject as Params)
      const headers = options.schemas?.headers
        ? ((yield* decodeUnknown(
            options.schemas.headers,
            headersToObject(context.request),
            "headers"
          )) as RequestHeaders)
        : (headersToObject(context.request) as RequestHeaders)
      const cookies = options.schemas?.cookies
        ? ((yield* decodeUnknown(
            options.schemas.cookies,
            cookiesToObject(context),
            "cookies"
          )) as RequestCookies)
        : (cookiesToObject(context) as RequestCookies)

      const handlerContext = makeRequestContext(
        context,
        requestId,
        body,
        query,
        params,
        headers,
        cookies,
        auth
      )
      const userAgent = context.request.headers.get("user-agent")
      const clientIp =
        context.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        context.request.headers.get("x-real-ip")
      const requestContext: RequestContext = {
        requestId,
        request: context.request,
        auth,
        headers: headersToObject(context.request),
        cookies: cookiesToObject(context),
        abortSignal: context.request.signal,
        ...(clientIp ? { clientIp } : {}),
        ...(userAgent ? { userAgent } : {})
      }

      const result = yield* handler(handlerContext).pipe(
        Effect.provideService(RequestContextTag, requestContext)
      )

      return options.schemas?.response
        ? yield* encode(options.schemas.response, result, "response")
        : result
    })

    const runnable = options.layer ? program.pipe(Effect.provide(options.layer)) : program

    try {
      const result = await Effect.runPromise(
        Effect.either(runnable as Effect.Effect<unknown, unknown>)
      )

      if (result._tag === "Right") {
        options.telemetry?.onSuccess?.({
          ...startEvent,
          durationMs: performance.now() - startedAt
        })
        return result.right
      }

      const mapped = mapError(result.left)
      context.set.status = mapped.status
      options.telemetry?.onError?.({
        ...startEvent,
        durationMs: performance.now() - startedAt,
        error: result.left
      })
      return mapped.body
    } catch (defect) {
      const mapped = mapError(defect)
      context.set.status = mapped.status
      options.telemetry?.onError?.({
        ...startEvent,
        durationMs: performance.now() - startedAt,
        error: defect
      })
      return mapped.body
    }
  }
