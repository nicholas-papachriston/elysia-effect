import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect"

export interface EffectLike<out A = unknown, out E = unknown, out R = unknown> {
  readonly pipe: (...args: readonly unknown[]) => unknown
  readonly [Symbol.iterator]: () => Iterator<unknown>
  readonly _A?: A
  readonly _E?: E
  readonly _R?: R
}

const EFFECT_SYMBOL = "Symbol(effect/Effect)"

export const isEffectValue = (value: unknown): value is EffectLike => {
  if (typeof value !== "object" || value === null) {
    return false
  }

  const record = value as { readonly pipe?: unknown; readonly _op?: unknown }
  if (typeof record.pipe !== "function" || typeof record._op !== "string") {
    return false
  }

  return Object.getOwnPropertySymbols(value).some((symbol) => String(symbol) === EFFECT_SYMBOL)
}

const asRunnable = <A, E, Requirements>(
  program: EffectLike<A, E, Requirements>
): Effect.Effect<A, E, Requirements> =>
  // SAFETY: Consumer Effect values share the Effect protocol across copies.
  program as Effect.Effect<A, E, Requirements>

export interface EffectRunner<Requirements = never> {
  readonly runPromise: <A, E>(program: Effect.Effect<A, E, Requirements>) => Promise<A>
  readonly runPromiseExit: <A, E>(
    program: Effect.Effect<A, E, Requirements>
  ) => Promise<Exit.Exit<A, E>>
}

export type ObservedExit<A, E> =
  | { readonly kind: "success"; readonly value: A }
  | { readonly kind: "failure"; readonly error: E }
  | { readonly kind: "interrupt" }
  | { readonly kind: "defect"; readonly error: unknown }

const defaultRunner: EffectRunner<never> = {
  runPromise: (program) => Effect.runPromise(program),
  runPromiseExit: (program) => Effect.runPromiseExit(program)
}

const runners = new WeakMap<object, EffectRunner<never>>()

export const createEffectRunner = <Requirements = never>(
  layer?: object
): EffectRunner<Requirements> => {
  if (layer === undefined) {
    return defaultRunner as EffectRunner<Requirements>
  }

  const cached = runners.get(layer)
  if (cached !== undefined) {
    return cached as EffectRunner<Requirements>
  }

  const runtime = ManagedRuntime.make(layer as Layer.Layer<Requirements>)
  const runner: EffectRunner<Requirements> = {
    runPromise: (program) => runtime.runPromise(program),
    runPromiseExit: (program) => runtime.runPromiseExit(program)
  }
  runners.set(layer, runner as EffectRunner<never>)
  return runner
}

export const withAbort = <A, E, Requirements>(
  program: Effect.Effect<A, E, Requirements>,
  signal: AbortSignal
): Effect.Effect<A, E, Requirements> =>
  program.pipe(
    Effect.raceFirst(
      Effect.async<never, never>((resume) => {
        if (signal.aborted) {
          return Effect.void
        }

        const onAbort = () => {
          resume(Effect.interrupt)
        }
        signal.addEventListener("abort", onAbort, { once: true })
        return Effect.sync(() => {
          signal.removeEventListener("abort", onAbort)
        })
      })
    )
  ) as Effect.Effect<A, E, Requirements>

export const observeExit = <A, E>(exit: Exit.Exit<A, E>): ObservedExit<A, E> => {
  if (Exit.isSuccess(exit)) {
    return { kind: "success", value: exit.value }
  }

  if (Exit.isInterrupted(exit)) {
    return { kind: "interrupt" }
  }

  const failure = Cause.failureOption(exit.cause)
  if (failure._tag === "Some") {
    return { kind: "failure", error: failure.value }
  }

  return { kind: "defect", error: Cause.squash(exit.cause) }
}

export const runObserved = async <A, E, Requirements>(
  runner: EffectRunner<Requirements>,
  program: EffectLike<A, E, Requirements>,
  signal: AbortSignal
): Promise<ObservedExit<A, E>> =>
  observeExit(await runner.runPromiseExit(withAbort(asRunnable(program), signal)))
