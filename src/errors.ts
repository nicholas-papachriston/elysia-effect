import { Data } from "effect"

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string
  readonly issues?: readonly string[]
}> {}

export interface ErrorResponse {
  readonly code: string
  readonly message: string
}

export interface HttpErrorResponse {
  readonly status: number
  readonly body: ErrorResponse
}

type TaggedHttpError<Tag extends string = string> = {
  readonly _tag: Tag
  readonly message: string
  readonly reason?: string
}

type VoiceProviderTaggedError = TaggedHttpError & {
  readonly reason: string
  readonly providerId: string
}

type TaggedErrorCode = string | ((error: TaggedHttpError) => string)

type TaggedErrorMessage = string | ((error: TaggedHttpError) => string)

interface TaggedErrorMapping {
  readonly status: number
  readonly code: TaggedErrorCode
  readonly message?: TaggedErrorMessage
}

const hasTag = <Tag extends string>(value: unknown, tag: Tag): value is TaggedHttpError<Tag> =>
  typeof value === "object" && value !== null && "_tag" in value && value._tag === tag

const reasonPrefixedCode =
  (prefix: string): TaggedErrorCode =>
  (error) =>
    `${prefix}_${error.reason ?? "error"}`

const resolveTaggedCode = (code: TaggedErrorCode, error: TaggedHttpError): string =>
  typeof code === "string" ? code : code(error)

const resolveTaggedMessage = (mapping: TaggedErrorMapping, error: TaggedHttpError): string => {
  if (mapping.message === undefined) {
    return error.message
  }

  return typeof mapping.message === "string" ? mapping.message : mapping.message(error)
}

const TAGGED_ERROR_MAPPINGS: Readonly<Record<string, TaggedErrorMapping>> = {
  ValidationError: { status: 400, code: "validation_error" },
  AuthError: { status: 401, code: "auth_error" },
  AuthorizationError: { status: 403, code: "authorization_error" },
  EligibilityError: {
    status: 403,
    code: (error) => error.reason ?? "eligibility_error"
  },
  NotFoundError: { status: 404, code: "not_found" },
  ConflictError: { status: 409, code: "conflict" },
  ServiceUnavailableError: {
    status: 503,
    code: "service_unavailable"
  },
  DatabaseConflictError: {
    status: 409,
    code: "database_conflict",
    message: "A conflicting record already exists"
  },
  IdempotencyConflictError: {
    status: 409,
    code: "idempotency_conflict",
    message: "Idempotency key conflict"
  },
  DatabaseError: {
    status: 503,
    code: "database_unavailable",
    message: "Database operation failed"
  },
  SupportRepositoryError: {
    status: 503,
    code: "support_unavailable",
    message: "Support repository operation failed"
  },
  ProviderError: {
    status: 502,
    code: "provider_error",
    message: "Upstream provider request failed"
  },
  ContentPolicyError: { status: 403, code: "content_policy_blocked" },
  ContentPolicyAuditError: {
    status: 503,
    code: "content_policy_audit_unavailable"
  },
  SafetySignalError: { status: 403, code: "safety_signal_intervention" },
  SafetySignalAuditError: {
    status: 503,
    code: "safety_signal_audit_unavailable"
  },
  PromptIntegrityError: { status: 403, code: "prompt_integrity_blocked" },
  PromptIntegrityAuditError: {
    status: 503,
    code: "prompt_integrity_audit_unavailable"
  },
  NotificationError: { status: 502, code: "notification_error" },
  AgeVerificationSignatureError: {
    status: 401,
    code: "age_verification_signature_error"
  },
  VoiceGenerationBlockedError: {
    status: 403,
    code: (error) => `voice_generation_blocked_${(error as VoiceProviderTaggedError).reason}`,
    message: (error) =>
      `Voice generation blocked for provider ${(error as VoiceProviderTaggedError).providerId}`
  },
  VoiceProviderRoutingError: {
    status: 403,
    code: (error) => `voice_provider_routing_${(error as VoiceProviderTaggedError).reason}`,
    message: (error) =>
      `Voice provider routing blocked for provider ${(error as VoiceProviderTaggedError).providerId}`
  },
  RateLimitError: { status: 429, code: "rate_limit_exceeded" },
  PersistenceInvariantError: {
    status: 500,
    code: "persistence_invariant",
    message: "Persistence invariant violated"
  },
  RandomUuidUnavailableError: { status: 503, code: "random_uuid_unavailable" },
  CsamDetectionError: {
    status: 503,
    code: reasonPrefixedCode("csam_detection")
  },
  CsamPresentationError: { status: 400, code: "csam_presentation_error" },
  CsamEscalationError: {
    status: 403,
    code: reasonPrefixedCode("csam_escalation")
  },
  SetupFormatAdapterError: {
    status: 400,
    code: reasonPrefixedCode("setup_format_adapter")
  },
  SetupFormatRegistryError: {
    status: 400,
    code: reasonPrefixedCode("setup_format_registry")
  },
  ElarisSetupValidationError: {
    status: 400,
    code: "elaris_setup_validation_error"
  },
  ElarisSetupVersionMismatchError: {
    status: 409,
    code: "elaris_setup_version_mismatch"
  },
  ElarisSetupMigrationError: {
    status: 400,
    code: "elaris_setup_migration_error"
  },
  CharacterCardV2DecodeError: {
    status: 400,
    code: "character_card_v2_decode_error"
  },
  CharacterCardV2EncodeError: {
    status: 400,
    code: "character_card_v2_encode_error"
  }
}

const runtimeConfigErrorResponse = (error: unknown): HttpErrorResponse | null => {
  if (hasTag(error, "RuntimeConfigVersionConflictError")) {
    return {
      status: 409,
      body: { code: "runtime_config_version_conflict", message: "Runtime config version conflict" }
    }
  }

  if (hasTag(error, "RuntimeConfigNotFound")) {
    return {
      status: 404,
      body: { code: "runtime_config_not_found", message: "Runtime config key is not recognized" }
    }
  }

  if (hasTag(error, "RuntimeConfigInvalidValue")) {
    return {
      status: 400,
      body: { code: "runtime_config_invalid_value", message: "Runtime config value is invalid" }
    }
  }

  if (hasTag(error, "RuntimeConfigSecretStoreUnavailable")) {
    return {
      status: 503,
      body: {
        code: "runtime_config_secret_store_unavailable",
        message: "Runtime config secret store is unavailable"
      }
    }
  }

  return null
}

const parseHostedProviderErrorMessage = (message: string): string => {
  try {
    const parsed = JSON.parse(message) as { error?: string; message?: string }
    return parsed.error ?? parsed.message ?? message
  } catch {
    return message
  }
}

const hostedGenerationErrorResponse = (error: unknown): HttpErrorResponse | null => {
  if (!hasTag(error, "HostedGenerationError")) {
    return null
  }

  const matched = error as { message: string; status?: number }
  const message = parseHostedProviderErrorMessage(matched.message)
  const moderated = message.toLowerCase().includes("content moderation")
  // Use 400 (not 403) so CloudFront same-origin SPA custom error pages do not replace API JSON.
  const status = moderated
    ? 400
    : typeof matched.status === "number" && matched.status >= 400 && matched.status < 600
      ? matched.status
      : 502

  return {
    status,
    body: {
      code: moderated ? "content_policy_blocked" : "hosted_generation_error",
      message: moderated ? message : "Hosted generation request failed"
    }
  }
}

const taggedErrorResponse = (error: unknown): HttpErrorResponse | null => {
  if (typeof error !== "object" || error === null || !("_tag" in error)) {
    return null
  }

  const tag = error._tag
  if (typeof tag !== "string") {
    return null
  }

  const mapping = TAGGED_ERROR_MAPPINGS[tag]
  if (mapping === undefined) {
    return null
  }

  const tagged = error as TaggedHttpError

  return {
    status: mapping.status,
    body: {
      code: resolveTaggedCode(mapping.code, tagged),
      message: resolveTaggedMessage(mapping, tagged)
    }
  }
}

export const defaultErrorMapper = (error: unknown): HttpErrorResponse =>
  runtimeConfigErrorResponse(error) ??
  hostedGenerationErrorResponse(error) ??
  taggedErrorResponse(error) ?? {
    status: 500,
    body: {
      code: "internal_error",
      message: "Internal server error"
    }
  }
