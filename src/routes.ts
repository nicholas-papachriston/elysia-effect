import type { Effect } from "effect"
import type { AnyElysia } from "elysia"
import {
  createEffectHandler,
  type EffectHandlerContext,
  type EffectHandlerOptions,
  type ElysiaLikeContext
} from "./handler"
import {
  type EffectOpenApiDetail,
  type EffectRouteOpenApiOptions,
  toOpenApiJsonSchema
} from "./openapi"
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

interface SimpleElysiaRouter {
  readonly get: (
    path: string,
    handler: (context: ElysiaLikeContext) => Promise<unknown>,
    options?: ElysiaRouteOptions
  ) => AnyElysia
  readonly post: (
    path: string,
    handler: (context: ElysiaLikeContext) => Promise<unknown>,
    options?: ElysiaRouteOptions
  ) => AnyElysia
  readonly patch: (
    path: string,
    handler: (context: ElysiaLikeContext) => Promise<unknown>,
    options?: ElysiaRouteOptions
  ) => AnyElysia
  readonly put: (
    path: string,
    handler: (context: ElysiaLikeContext) => Promise<unknown>,
    options?: ElysiaRouteOptions
  ) => AnyElysia
  readonly delete: (
    path: string,
    handler: (context: ElysiaLikeContext) => Promise<unknown>,
    options?: ElysiaRouteOptions
  ) => AnyElysia
}

const asRouter = (app: AnyElysia): SimpleElysiaRouter => app as unknown as SimpleElysiaRouter

const withMergedTelemetry = <
  Options extends EffectHandlerOptions<unknown, unknown, unknown, unknown, unknown, unknown, never>
>(
  options: Options
): Options => ({
  ...options,
  telemetry: mergeEffectTelemetry(options.telemetry)
})

const routeOptionsFor = (
  options: Pick<
    EffectHandlerOptions<unknown, unknown, unknown, unknown, unknown, unknown, never>,
    "schemas"
  >,
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

export const effectGet = <
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never
>(
  app: AnyElysia,
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
): AnyElysia =>
  asRouter(app).get(
    path,
    createEffectHandler(withMergedTelemetry(options), handler),
    routeOptionsFor(options, routeOptions)
  )

export const effectPost = <
  Body = Record<string, never>,
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never
>(
  app: AnyElysia,
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
): AnyElysia =>
  asRouter(app).post(
    path,
    createEffectHandler(withMergedTelemetry(options), handler),
    routeOptionsFor(options, routeOptions)
  )

export const effectPatch = <
  Body = Record<string, never>,
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never
>(
  app: AnyElysia,
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
): AnyElysia =>
  asRouter(app).patch(
    path,
    createEffectHandler(withMergedTelemetry(options), handler),
    routeOptionsFor(options, routeOptions)
  )

export const effectPut = <
  Body = Record<string, never>,
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never
>(
  app: AnyElysia,
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
): AnyElysia =>
  asRouter(app).put(
    path,
    createEffectHandler(withMergedTelemetry(options), handler),
    routeOptionsFor(options, routeOptions)
  )

export const effectDelete = <
  Query = Record<string, never>,
  Params = Record<string, never>,
  RequestHeaders = Record<string, string>,
  RequestCookies = Record<string, string>,
  ResponseBody = unknown,
  Requirements = never,
  Body = Record<string, never>
>(
  app: AnyElysia,
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
): AnyElysia =>
  asRouter(app).delete(
    path,
    createEffectHandler(withMergedTelemetry(options), handler),
    routeOptionsFor(options, routeOptions)
  )
