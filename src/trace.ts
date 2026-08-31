export const TRACE_ID_HEADER = "x-trace-id" as const
export const TRACEPARENT_HEADER = "traceparent" as const

export const readTraceIdFromTraceparent = (
  traceparent: string | null | undefined
): string | null => {
  if (traceparent === null || traceparent === undefined) {
    return null
  }

  const trimmed = traceparent.trim()
  if (trimmed.length === 0) {
    return null
  }

  const parts = trimmed.split("-")
  const traceId = parts[1]
  return typeof traceId === "string" && traceId.length > 0 ? traceId : null
}

/** Prefer explicit trace header, then W3C traceparent, then the request id for correlation. */
export const readTraceId = (headers: Pick<Headers, "get">, requestId: string): string => {
  const explicit = headers.get(TRACE_ID_HEADER)?.trim()
  if (explicit !== undefined && explicit.length > 0) {
    return explicit
  }

  const fromTraceparent = readTraceIdFromTraceparent(headers.get(TRACEPARENT_HEADER))
  if (fromTraceparent !== null) {
    return fromTraceparent
  }

  return requestId
}
