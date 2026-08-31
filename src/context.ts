import { Context } from "effect"

export type RequestId = string
export type UserId = string

export interface AuthContext {
  readonly userId?: UserId
  readonly isAdmin: boolean
  readonly isEmailVerified: boolean
}

export interface RequestContext {
  readonly requestId: RequestId
  readonly request: Request
  readonly auth: AuthContext
  readonly cookies: Readonly<Record<string, string>>
  readonly headers: Readonly<Record<string, string>>
  readonly clientIp?: string
  readonly userAgent?: string
  readonly abortSignal: AbortSignal
}

export class RequestContextTag extends Context.Tag("elysia-effect/RequestContext")<
  RequestContextTag,
  RequestContext
>() {}
