import { Effect, Schema } from "effect"
import { createEffectHandler } from "../src/handler"
import { toElysiaValidator, toStandardSchema } from "../src/schema"

const Item = Schema.Struct({
  name: Schema.String
})

const expectString = (value: string): string => value

export const inferredHandler = createEffectHandler<{ readonly name: string }>(
  { schemas: { body: Item } },
  ({ body }) => Effect.succeed({ name: expectString(body.name) })
)

export const nativeValidator = toElysiaValidator({
  body: Item,
  response: Item
})

export const nativeBody = toStandardSchema(Item)
