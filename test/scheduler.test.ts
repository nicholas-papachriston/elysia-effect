import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { runEffectCronJob } from "../src/scheduler"

describe("elysia-effect scheduler", () => {
  test("runEffectCronJob completes successful cron work", async () => {
    let ran = false

    const outcome = await runEffectCronJob({
      name: "heartbeat",
      run: () =>
        Effect.sync(() => {
          ran = true
        })
    })

    expect(ran).toBe(true)
    expect(outcome._tag).toBe("Completed")
    if (outcome._tag === "Completed") {
      expect(outcome.name).toBe("heartbeat")
      expect(outcome.durationMs).toBeGreaterThanOrEqual(0)
    }
  })

  test("runEffectCronJob skips when the lock is unavailable", async () => {
    let ran = false

    const outcome = await runEffectCronJob({
      name: "locked-job",
      lock: {
        acquire: () => Effect.succeed(null)
      },
      run: () =>
        Effect.sync(() => {
          ran = true
        })
    })

    expect(ran).toBe(false)
    expect(outcome._tag).toBe("Skipped")
  })

  test("runEffectCronJob maps typed failures", async () => {
    class JobError {
      readonly _tag = "JobError"
      constructor(readonly message: string) {}
    }

    const outcome = await runEffectCronJob({
      name: "failing-job",
      mapError: (error) => (error instanceof JobError ? error.message : "unknown"),
      run: () => Effect.fail(new JobError("boom"))
    })

    expect(outcome._tag).toBe("Failed")
    if (outcome._tag === "Failed") {
      expect(outcome.mappedError).toBe("boom")
    }
  })
})
