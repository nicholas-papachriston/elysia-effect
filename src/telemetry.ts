import type { EffectTelemetryHooks } from "./handler"

let globalTelemetry: EffectTelemetryHooks | undefined

export const configureGlobalEffectTelemetry = (hooks: EffectTelemetryHooks | undefined): void => {
  globalTelemetry = hooks
}

export const mergeEffectTelemetry = (
  local: EffectTelemetryHooks | undefined
): EffectTelemetryHooks | undefined => {
  if (globalTelemetry === undefined && local === undefined) {
    return undefined
  }

  return {
    onStart: (event) => {
      globalTelemetry?.onStart?.(event)
      local?.onStart?.(event)
    },
    onSuccess: (event) => {
      globalTelemetry?.onSuccess?.(event)
      local?.onSuccess?.(event)
    },
    onError: (event) => {
      globalTelemetry?.onError?.(event)
      local?.onError?.(event)
    }
  }
}
