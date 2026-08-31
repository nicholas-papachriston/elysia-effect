import { describe, expect, test } from "bun:test"
import { Cause, Effect, Schema } from "effect"
import { ValidationError } from "../src/errors"
import { decodeUnknown, encode, toElysiaValidator, toStandardSchema } from "../src/schema"

const Payload = Schema.Struct({
  name: Schema.String
})

describe("schema helpers", () => {
  test("decodes valid unknown input", async () => {
    await expect(
      Effect.runPromise(decodeUnknown(Payload, { name: "Elaris" }, "payload"))
    ).resolves.toEqual({ name: "Elaris" })
  })

  test("maps decode failures to ValidationError", async () => {
    const exit = await Effect.runPromiseExit(decodeUnknown(Payload, { name: 1 }, "payload"))

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause)

      expect(failure._tag).toBe("Some")
      if (failure._tag === "Some") {
        expect(failure.value).toBeInstanceOf(ValidationError)
      }
    }
  })

  test("encodes valid output", async () => {
    await expect(
      Effect.runPromise(encode(Payload, { name: "Elaris" }, "payload"))
    ).resolves.toEqual({ name: "Elaris" })
  })

  test("maps encode failures to ValidationError", async () => {
    const exit = await Effect.runPromiseExit(encode(Payload, { name: 1 }, "payload"))

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause)

      expect(failure._tag).toBe("Some")
      if (failure._tag === "Some") {
        expect(failure.value).toBeInstanceOf(ValidationError)
      }
    }
  })

  test("exports ValidationError as the public validation error type", () => {
    const error = new ValidationError({ message: "Invalid payload" })

    expect(error._tag).toBe("ValidationError")
  })

  test("exposes Effect Schema as Standard Schema for Elysia", () => {
    const standard = toStandardSchema(Payload)

    expect(standard["~standard"].vendor).toBe("effect")
    expect(typeof standard["~standard"].validate).toBe("function")
  })

  test("maps Effect Schema fields onto Elysia validator options", () => {
    const validator = toElysiaValidator({
      body: Payload,
      query: Payload,
      cookies: Payload,
      response: Payload
    })

    expect(validator.body?.["~standard"].vendor).toBe("effect")
    expect(validator.query?.["~standard"].vendor).toBe("effect")
    expect(validator.cookie?.["~standard"].vendor).toBe("effect")
    expect(validator.response?.["~standard"].vendor).toBe("effect")
  })
})
