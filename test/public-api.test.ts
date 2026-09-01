import { describe, expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { effectPlugin as rootEffectPlugin } from "elysia-effect"
import { effectPlugin as packageEffectPlugin } from "elysia-effect/plugin"
import { effectGet as packageEffectGet } from "elysia-effect/routes"
import { RequestContextTag } from "../src/context"
import { defaultErrorMapper } from "../src/errors"
import { anonymousAuth, authFromHeaders, createEffectHandler } from "../src/handler"
import { openApiDetail, openApiRouteOptions, openApiSchemas } from "../src/openapi"
import { effectPlugin } from "../src/plugin"
import {
  decodeQueueMessageEnvelope,
  encodeQueueMessageEnvelope,
  makeQueueMessageEnvelopeSchema,
  QueuePayloadDecodeError,
  QueuePayloadEncodeError
} from "../src/queue"
import { effectDelete, effectGet, effectHead, effectPatch, effectPost } from "../src/routes"
import { decodeUnknown, encode, toElysiaValidator, toStandardSchema } from "../src/schema"
import {
  encodeServerSentEvent,
  sseStreamResponse,
  streamToReadableStream,
  streamToReadableStreamEffect
} from "../src/stream"

const testDirectory = new URL(".", import.meta.url)
const testDirectoryPath = fileURLToPath(testDirectory)
const packageDirectoryPath = dirname(testDirectoryPath)
const sourceDirectoryPath = join(packageDirectoryPath, "src")

describe("elysia-effect public API", () => {
  test("imports supported helpers from package subpaths", () => {
    expect(anonymousAuth).toEqual({
      isAdmin: false,
      isEmailVerified: false
    })
    expect(typeof authFromHeaders).toBe("function")
    expect(typeof createEffectHandler).toBe("function")
    expect(typeof decodeQueueMessageEnvelope).toBe("function")
    expect(typeof decodeUnknown).toBe("function")
    expect(typeof defaultErrorMapper).toBe("function")
    expect(typeof effectDelete).toBe("function")
    expect(typeof effectGet).toBe("function")
    expect(typeof effectHead).toBe("function")
    expect(typeof effectPatch).toBe("function")
    expect(typeof effectPlugin).toBe("function")
    expect(packageEffectGet).toBe(effectGet)
    expect(packageEffectPlugin).toBe(effectPlugin)
    expect(rootEffectPlugin).toBe(effectPlugin)
    expect(typeof effectPost).toBe("function")
    expect(typeof encode).toBe("function")
    expect(typeof encodeQueueMessageEnvelope).toBe("function")
    expect(typeof encodeServerSentEvent).toBe("function")
    expect(typeof makeQueueMessageEnvelopeSchema).toBe("function")
    expect(typeof openApiDetail).toBe("function")
    expect(typeof openApiRouteOptions).toBe("function")
    expect(typeof openApiSchemas).toBe("function")
    expect(typeof QueuePayloadDecodeError).toBe("function")
    expect(typeof QueuePayloadEncodeError).toBe("function")
    expect(typeof RequestContextTag).toBe("function")
    expect(typeof sseStreamResponse).toBe("function")
    expect(typeof streamToReadableStream).toBe("function")
    expect(typeof streamToReadableStreamEffect).toBe("function")
    expect(typeof toStandardSchema).toBe("function")
    expect(typeof toElysiaValidator).toBe("function")
  })

  test("package tests avoid the removed package root barrel", async () => {
    const files = await readdir(testDirectory)
    const rootImportPattern =
      /(?:from\s+|import\s*\(\s*|import\s+|export\s+[^"']*from\s+)["']\.\.\/src["']/u
    const offenders: string[] = []

    for (const file of files) {
      if (!file.endsWith(".test.ts")) {
        continue
      }

      const source = await Bun.file(join(testDirectoryPath, file)).text()

      if (rootImportPattern.test(source)) {
        offenders.push(file)
      }
    }

    expect(offenders).toEqual([])
  })

  test("package source stays free of Elaris domain package dependencies", async () => {
    const packageJson = (await Bun.file(join(packageDirectoryPath, "package.json")).json()) as {
      readonly dependencies?: Record<string, string>
      readonly peerDependencies?: Record<string, string>
    }
    const dependencies = Object.keys(packageJson.dependencies ?? {})
    const sourceFiles = await readdir(sourceDirectoryPath)
    const domainOffenders: string[] = []
    const cronOffenders: string[] = []

    for (const file of sourceFiles) {
      if (!file.endsWith(".ts")) {
        continue
      }

      const source = await Bun.file(join(sourceDirectoryPath, file)).text()

      if (source.includes("@elaris/domain") || source.includes("@elaris/shared")) {
        domainOffenders.push(file)
      }

      if (file !== "scheduler.ts" && source.includes("@elysiajs/cron")) {
        cronOffenders.push(file)
      }
    }

    expect(dependencies).toEqual([])
    expect(packageJson.peerDependencies?.effect).toBeDefined()
    expect(packageJson.peerDependencies?.elysia).toBeDefined()
    expect(packageJson.peerDependencies?.["@elysiajs/cron"]).toBeDefined()
    expect(domainOffenders).toEqual([])
    expect(cronOffenders).toEqual([])
  })

  test("root package entry does not load the optional cron peer", async () => {
    const index = await Bun.file(join(sourceDirectoryPath, "index.ts")).text()

    expect(index.includes("scheduler")).toBe(false)
    expect(index.includes("@elysiajs/cron")).toBe(false)
  })

  test("uses the unscoped community plugin name", async () => {
    const packageJson = (await Bun.file(join(packageDirectoryPath, "package.json")).json()) as {
      readonly name: string
      readonly private?: boolean
      readonly license?: string
    }

    expect(packageJson.name).toBe("elysia-effect")
    expect(packageJson.private).toBeUndefined()
    expect(packageJson.license).toBe("MIT")
  })
})
