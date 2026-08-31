import { Effect, type Layer } from "effect"
import { Elysia } from "elysia"
import { defaultErrorMapper } from "./errors"

export interface EffectPluginOptions<Requirements = never> {
  readonly layer?: Layer.Layer<Requirements>
}

const responseFromMappedError = (error: unknown) => {
  const mapped = defaultErrorMapper(error)

  return new Response(JSON.stringify(mapped.body), {
    status: mapped.status,
    headers: {
      "content-type": "application/json"
    }
  })
}

export const effectPlugin = <Requirements = never>(
  options: EffectPluginOptions<Requirements> = {}
) =>
  new Elysia({ name: "@papachriston/elysia-effect" }).decorate(
    "runEffect",
    async <A, E>(program: Effect.Effect<A, E, Requirements>) => {
      const runnable = options.layer ? program.pipe(Effect.provide(options.layer)) : program
      const result = await Effect.runPromise(Effect.either(runnable as Effect.Effect<A, E>)).catch(
        (defect) => {
          throw responseFromMappedError(defect)
        }
      )

      if (result._tag === "Right") {
        return result.right
      }

      throw responseFromMappedError(result.left)
    }
  )
