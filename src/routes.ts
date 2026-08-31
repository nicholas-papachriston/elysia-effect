import type { Effect } from "effect"
import {
  createEffectHandler,
  type EffectHandlerContext,
  type EffectHandlerOptions,
  type EffectTelemetryHooks
} from "./handler"
import {
  type EffectOpenApiDetail,
  type EffectRouteOpenApiOptions,
  toOpenApiJsonSchema
} from "./openapi"
import type { EffectHttpMethod } from "./router"
import { registerElysiaRoute } from "./router"
import { mergeEffectTelemetry } from "./telemetry"

type EffectRouteHandler<
  Body,
  Query,
  Params,
  RequestHeaders,
  RequestCookies,
  ResponseBody,
  Requirements
> = (
  context: EffectHandlerContext<Body, Query, Params, RequestHeaders, RequestCookies>
) => Effect.Effect<ResponseBody, unknown, Requirements>

type ElysiaRouteOptions = EffectRouteOpenApiOptions | Record<string, unknown>

const withMergedTelemetry = <Options extends { readonly telemetry?: EffectTelemetryHooks }>(
  options: Options
): Options => ({
  ...options,
  telemetry: mergeEffectTelemetry(options.telemetry)
})

const routeOptionsFor = (
  options: {
    readonly rawBody?: boolean
    readonly schemas?: {
      readonly response?: Parameters<typeof toOpenApiJsonSchema>[0]
    }
  },
  routeOptions?: ElysiaRouteOptions
): EffectRouteOpenApiOptions => {
  const openApiOptions = routeOptions as EffectRouteOpenApiOptions | undefined
  const detail = openApiOptions?.detail
  const responseSchema = options.schemas?.response
  const responseDetail = responseSchema
    ? ({
        responses: {
          200: {
            description: "Response for status 200",
            content: {
              "application/json": {
                schema: toOpenApiJsonSchema(responseSchema)
              }
            }
          }
        }
      } satisfies Pick<EffectOpenApiDetail, "responses">)
    : {}

  return {
    ...(options.rawBody ? { parse: "none" } : {}),
    ...openApiOptions,
    ...(detail || responseSchema
      ? {
          detail: {
            ...responseDetail,
            ...detail
          }
        }
      : {})
  }
}

const attachEffectRoute = <
  App,
  Body,
  Query,
  Params,
  RequestHeaders,
  RequestCookies,
  ResponseBody,
  Requirements
>(
  app: App,
  method: EffectHttpMethod,
  path: string,
  options: EffectHandlerOptions<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  handler: EffectRouteHandler<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  routeOptions?: ElysiaRouteOptions
): App =>
  registerElysiaRoute(
    app,
    method,
    path,
    createEffectHandler(withMergedTelemetry(options), handler) as (
      context: unknown
    ) => Promise<unknown>,
    routeOptionsFor(options, routeOptions)
  )

export const effectRoute = <
  Body = Record<string, never>,
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never,
  App = unknown
>(
  app: App,
  method: EffectHttpMethod,
  path: string,
  options: EffectHandlerOptions<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  handler: EffectRouteHandler<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  routeOptions?: ElysiaRouteOptions
): App => attachEffectRoute(app, method, path, options, handler, routeOptions)

export const effectGet = <
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never,
  App = unknown
>(
  app: App,
  path: string,
  options: EffectHandlerOptions<
    Record<string, never>,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  handler: EffectRouteHandler<
    Record<string, never>,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  routeOptions?: ElysiaRouteOptions
): App => attachEffectRoute(app, "get", path, options, handler, routeOptions)

export const effectHead = <
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never,
  App = unknown
>(
  app: App,
  path: string,
  options: EffectHandlerOptions<
    Record<string, never>,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  handler: EffectRouteHandler<
    Record<string, never>,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  routeOptions?: ElysiaRouteOptions
): App => attachEffectRoute(app, "head", path, options, handler, routeOptions)

export const effectOptions = <
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never,
  App = unknown
>(
  app: App,
  path: string,
  options: EffectHandlerOptions<
    Record<string, never>,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  handler: EffectRouteHandler<
    Record<string, never>,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  routeOptions?: ElysiaRouteOptions
): App => attachEffectRoute(app, "options", path, options, handler, routeOptions)

export const effectPost = <
  Body = Record<string, never>,
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never,
  App = unknown
>(
  app: App,
  path: string,
  options: EffectHandlerOptions<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  handler: EffectRouteHandler<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  routeOptions?: ElysiaRouteOptions
): App => attachEffectRoute(app, "post", path, options, handler, routeOptions)

export const effectPatch = <
  Body = Record<string, never>,
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never,
  App = unknown
>(
  app: App,
  path: string,
  options: EffectHandlerOptions<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  handler: EffectRouteHandler<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  routeOptions?: ElysiaRouteOptions
): App => attachEffectRoute(app, "patch", path, options, handler, routeOptions)

export const effectPut = <
  Body = Record<string, never>,
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never,
  App = unknown
>(
  app: App,
  path: string,
  options: EffectHandlerOptions<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  handler: EffectRouteHandler<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  routeOptions?: ElysiaRouteOptions
): App => attachEffectRoute(app, "put", path, options, handler, routeOptions)

export const effectDelete = <
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never,
  Body = Record<string, never>,
  App = unknown
>(
  app: App,
  path: string,
  options: EffectHandlerOptions<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  handler: EffectRouteHandler<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  routeOptions?: ElysiaRouteOptions
): App => attachEffectRoute(app, "delete", path, options, handler, routeOptions)

export const effectAll = <
  Body = Record<string, never>,
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never,
  App = unknown
>(
  app: App,
  path: string,
  options: EffectHandlerOptions<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  handler: EffectRouteHandler<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  routeOptions?: ElysiaRouteOptions
): App => attachEffectRoute(app, "all", path, options, handler, routeOptions)

export const effectConnect = <
  Body = Record<string, never>,
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never,
  App = unknown
>(
  app: App,
  path: string,
  options: EffectHandlerOptions<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  handler: EffectRouteHandler<
    Body,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  routeOptions?: ElysiaRouteOptions
): App => attachEffectRoute(app, "connect", path, options, handler, routeOptions)

export const effectTrace = <
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never,
  App = unknown
>(
  app: App,
  path: string,
  options: EffectHandlerOptions<
    Record<string, never>,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  handler: EffectRouteHandler<
    Record<string, never>,
    Query,
    Params,
    RequestHeaders,
    RequestCookies,
    ResponseBody,
    Requirements
  >,
  routeOptions?: ElysiaRouteOptions
): App => attachEffectRoute(app, "trace", path, options, handler, routeOptions)
