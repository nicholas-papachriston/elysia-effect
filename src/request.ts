import type { RequestId } from "./context"
import type { ElysiaLikeContext } from "./handler"

export const emptyObject: Record<string, never> = {}

export const getRequestId = (context: ElysiaLikeContext): RequestId => {
  const incoming = context.headers?.["x-request-id"] ?? context.request.headers.get("x-request-id")
  return (incoming ?? crypto.randomUUID()) as RequestId
}

export const headersToObject = (request: Request): Record<string, string> =>
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

export const cookiesToObject = (context: ElysiaLikeContext): Record<string, string> => {
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

export const readClientMeta = (
  request: Request
): {
  readonly clientIp?: string
  readonly userAgent?: string
} => {
  const userAgent = request.headers.get("user-agent") ?? undefined
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const clientIp = forwarded ?? request.headers.get("x-real-ip") ?? undefined

  return {
    ...(clientIp ? { clientIp } : {}),
    ...(userAgent ? { userAgent } : {})
  }
}
