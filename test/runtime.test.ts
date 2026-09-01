import { describe, expect, test } from "bun:test"
import { Context, Effect, Exit, Layer } from "effect"
import {
  createEffectRunner,
  isEffectValue,
  observeExit,
  runObserved,
  withAbort
} from "../src/runtime"

class CounterTag extends Context.Tag("RuntimeCounter")<CounterTag, { readonly n: number }>() {}

describe("effect runtime adapter", () => {
  test("reuses a ManagedRuntime for the same Layer object", async () => {
    const layer = Layer.succeed(CounterTag, { n: 7 })
    const first = createEffectRunner(layer)
    const second = createEffectRunner(layer)

    expect(second).toBe(first)
    await expect(first.runPromise(Effect.map(CounterTag, (counter) => counter.n))).resolves.toBe(7)
  })

  test("observes successful and failed exits", () => {
    expect(observeExit(Exit.succeed(1))).toEqual({ kind: "success", value: 1 })
    expect(observeExit(Exit.fail("nope"))).toEqual({ kind: "failure", error: "nope" })
  })

  test("interrupts a program when the request aborts", async () => {
    const controller = new AbortController()
    const started = Promise.withResolvers<void>()
    const program = withAbort(
      Effect.gen(function* () {
        started.resolve()
        return yield* Effect.sleep("2 seconds").pipe(Effect.as("done"))
      }),
      controller.signal
    )
    const running = runObserved(createEffectRunner(), program, controller.signal)
    await started.promise
    controller.abort()

    const observed = await running

    expect(observed.kind).toBe("interrupt")
  })

  test("detects Effect values without a unique TypeId", () => {
    expect(isEffectValue(Effect.succeed(1))).toBe(true)
    expect(isEffectValue({ ok: true })).toBe(false)
    expect(isEffectValue(null)).toBe(false)
  })
})
