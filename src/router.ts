import type { EffectRouteOpenApiOptions } from "./openapi"

export type EffectHttpMethod =
  | "all"
  | "connect"
  | "delete"
  | "get"
  | "head"
  | "options"
  | "patch"
  | "post"
  | "put"
  | "trace"

type ElysiaRouteHandler = (context: unknown) => Promise<unknown>
type ElysiaRouteOptions = EffectRouteOpenApiOptions | Record<string, unknown>

interface SimpleElysiaRouter {
  readonly all: (path: string, handler: ElysiaRouteHandler, options?: ElysiaRouteOptions) => unknown
  readonly connect: (
    path: string,
    handler: ElysiaRouteHandler,
    options?: ElysiaRouteOptions
  ) => unknown
  readonly delete: (
    path: string,
    handler: ElysiaRouteHandler,
    options?: ElysiaRouteOptions
  ) => unknown
  readonly get: (path: string, handler: ElysiaRouteHandler, options?: ElysiaRouteOptions) => unknown
  readonly head: (
    path: string,
    handler: ElysiaRouteHandler,
    options?: ElysiaRouteOptions
  ) => unknown
  readonly options: (
    path: string,
    handler: ElysiaRouteHandler,
    options?: ElysiaRouteOptions
  ) => unknown
  readonly patch: (
    path: string,
    handler: ElysiaRouteHandler,
    options?: ElysiaRouteOptions
  ) => unknown
  readonly post: (
    path: string,
    handler: ElysiaRouteHandler,
    options?: ElysiaRouteOptions
  ) => unknown
  readonly put: (path: string, handler: ElysiaRouteHandler, options?: ElysiaRouteOptions) => unknown
  readonly trace: (
    path: string,
    handler: ElysiaRouteHandler,
    options?: ElysiaRouteOptions
  ) => unknown
}

const asRouter = (app: unknown): SimpleElysiaRouter => app as SimpleElysiaRouter

export const registerElysiaRoute = <App>(
  app: App,
  method: EffectHttpMethod,
  path: string,
  handler: ElysiaRouteHandler,
  options?: ElysiaRouteOptions
): App => {
  asRouter(app)[method](path, handler, options)
  return app
}
