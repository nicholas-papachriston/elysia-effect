import { type CronConfig, cron as elysiaCron } from "@elysiajs/cron"
import { Effect } from "effect"
import { createEffectRunner, type EffectLike } from "./runtime"

const asEffect = <A, E, R>(program: EffectLike<A, E, R>): Effect.Effect<A, E, R> =>
  // SAFETY: Consumer Effect values share the Effect protocol across copies.
  program as Effect.Effect<A, E, R>

export interface EffectCronJobContext<Name extends string = string> {
  readonly name: Name
  readonly startedAt: Date
}

export interface EffectCronLockLease<Requirements = never> {
  readonly release: () => EffectLike<void, never, Requirements>
}

export interface EffectCronLock<Name extends string = string, E = unknown, Requirements = never> {
  readonly acquire: (
    context: EffectCronJobContext<Name>
  ) => EffectLike<EffectCronLockLease<Requirements> | null, E, Requirements>
}

export interface EffectCronSuccessEvent<Name extends string = string> {
  readonly name: Name
  readonly durationMs: number
}

export interface EffectCronSkipEvent<Name extends string = string> {
  readonly name: Name
  readonly durationMs: number
  readonly reason: "lock_unavailable"
}

export interface EffectCronFailureEvent<Name extends string = string> {
  readonly name: Name
  readonly durationMs: number
  readonly error: unknown
  readonly mappedError: unknown
  readonly kind: "failure" | "defect"
}

export type EffectCronJobOutcome<Name extends string = string> =
  | ({ readonly _tag: "Completed" } & EffectCronSuccessEvent<Name>)
  | ({ readonly _tag: "Skipped" } & EffectCronSkipEvent<Name>)
  | ({ readonly _tag: "Failed" } & EffectCronFailureEvent<Name>)
  | ({ readonly _tag: "Defected" } & EffectCronFailureEvent<Name>)

export interface EffectCronRunnerOptions<Name extends string, E, Requirements> {
  readonly name: Name
  readonly run: (context: EffectCronJobContext<Name>) => EffectLike<void, E, Requirements>
  readonly layer?: object
  readonly lock?: EffectCronLock<Name, E, Requirements>
  readonly mapError?: (error: E) => unknown
  readonly onSuccess?: (event: EffectCronSuccessEvent<Name>) => void | Promise<void>
  readonly onSkip?: (event: EffectCronSkipEvent<Name>) => void | Promise<void>
  readonly onFailure?: (event: EffectCronFailureEvent<Name>) => void | Promise<void>
}

export type EffectCronConfig<Name extends string, E, Requirements> = Omit<CronConfig<Name>, "run"> &
  EffectCronRunnerOptions<Name, E, Requirements>

const runHook = (hook: () => void | Promise<void>) =>
  Effect.promise(async () => {
    await hook()
  }).pipe(Effect.catchAllCause(() => Effect.void))

const makeCronProgram = <Name extends string, E, Requirements>(
  context: EffectCronJobContext<Name>,
  options: EffectCronRunnerOptions<Name, E, Requirements>
): Effect.Effect<"completed" | "skipped", E, Requirements> => {
  const runJob = asEffect(options.run(context)).pipe(Effect.as("completed" as const))

  if (options.lock === undefined) {
    return runJob
  }
  const lock = options.lock

  return Effect.gen(function* () {
    const lease = yield* asEffect(lock.acquire(context))
    if (lease === null || lease === undefined) {
      return "skipped" as const
    }

    return yield* runJob.pipe(Effect.ensuring(asEffect(lease.release())))
  })
}

const runOptionalHook = async (hook: Effect.Effect<void>) => {
  await Effect.runPromise(hook)
}

export const runEffectCronJob = async <Name extends string, E, Requirements>(
  options: EffectCronRunnerOptions<Name, E, Requirements>
): Promise<EffectCronJobOutcome<Name>> => {
  const startedAt = performance.now()
  const context: EffectCronJobContext<Name> = {
    name: options.name,
    startedAt: new Date()
  }
  const program = makeCronProgram(context, options)
  const runner = createEffectRunner<Requirements>(options.layer)
  const runnable = program as Effect.Effect<"completed" | "skipped", E, Requirements>

  try {
    const result = await runner.runPromise(Effect.either(runnable))
    const durationMs = performance.now() - startedAt

    if (result._tag === "Right") {
      if (result.right === "skipped") {
        const event: EffectCronSkipEvent<Name> = {
          name: options.name,
          durationMs,
          reason: "lock_unavailable"
        }
        const onSkip = options.onSkip
        if (onSkip !== undefined) {
          await runOptionalHook(runHook(() => onSkip(event)))
        }

        return { _tag: "Skipped", ...event }
      }

      const event: EffectCronSuccessEvent<Name> = {
        name: options.name,
        durationMs
      }
      const onSuccess = options.onSuccess
      if (onSuccess !== undefined) {
        await runOptionalHook(runHook(() => onSuccess(event)))
      }

      return { _tag: "Completed", ...event }
    }

    const mappedError = options.mapError ? options.mapError(result.left) : result.left
    const event: EffectCronFailureEvent<Name> = {
      name: options.name,
      durationMs,
      error: result.left,
      mappedError,
      kind: "failure"
    }
    const onFailure = options.onFailure
    if (onFailure !== undefined) {
      await runOptionalHook(runHook(() => onFailure(event)))
    }

    return { _tag: "Failed", ...event }
  } catch (defect) {
    const durationMs = performance.now() - startedAt
    const event: EffectCronFailureEvent<Name> = {
      name: options.name,
      durationMs,
      error: defect,
      mappedError: defect,
      kind: "defect"
    }
    const onFailure = options.onFailure
    if (onFailure !== undefined) {
      await runOptionalHook(runHook(() => onFailure(event)))
    }

    return { _tag: "Defected", ...event }
  }
}

export const cron = <Name extends string, E = unknown, Requirements = never>(
  options: EffectCronConfig<Name, E, Requirements>
  // SAFETY: keep the consumer Elysia type when nested copies differ.
): any => {
  const { run, layer, lock, mapError, onSuccess, onSkip, onFailure, ...cronOptions } = options
  const runnerOptions: EffectCronRunnerOptions<Name, E, Requirements> = {
    name: options.name,
    run,
    ...(layer ? { layer } : {}),
    ...(lock ? { lock } : {}),
    ...(mapError ? { mapError } : {}),
    ...(onSuccess ? { onSuccess } : {}),
    ...(onSkip ? { onSkip } : {}),
    ...(onFailure ? { onFailure } : {})
  }

  return elysiaCron({
    ...cronOptions,
    pattern: cronOptions.pattern,
    run: () => runEffectCronJob(runnerOptions).then(() => undefined)
  })
}
