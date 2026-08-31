import { describe, expect, test } from "bun:test"
import { Data } from "effect"
import { defaultErrorMapper, ValidationError } from "../src/errors"

class AuthorizationError extends Data.TaggedError("AuthorizationError")<{
  readonly message: string
}> {}

class AuthError extends Data.TaggedError("AuthError")<{
  readonly message: string
}> {}

class ServiceUnavailableError extends Data.TaggedError("ServiceUnavailableError")<{
  readonly message: string
}> {}

class ConflictError extends Data.TaggedError("ConflictError")<{
  readonly message: string
}> {}

class EligibilityError extends Data.TaggedError("EligibilityError")<{
  readonly message: string
  readonly reason?: string
}> {}

class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly message: string
}> {}

class ProviderError extends Data.TaggedError("ProviderError")<{
  readonly message: string
}> {}

class ContentPolicyError extends Data.TaggedError("ContentPolicyError")<{
  readonly message: string
  readonly reason?: string
}> {}

class ContentPolicyAuditError extends Data.TaggedError("ContentPolicyAuditError")<{
  readonly message: string
}> {}

class PromptIntegrityError extends Data.TaggedError("PromptIntegrityError")<{
  readonly message: string
}> {}

class PromptIntegrityAuditError extends Data.TaggedError("PromptIntegrityAuditError")<{
  readonly message: string
}> {}

class AgeVerificationSignatureError extends Data.TaggedError("AgeVerificationSignatureError")<{
  readonly message: string
}> {}

class NotificationError extends Data.TaggedError("NotificationError")<{
  readonly message: string
}> {}

class VoiceGenerationBlockedError extends Data.TaggedError("VoiceGenerationBlockedError")<{
  readonly reason: "provider_disabled"
  readonly providerId: string
}> {}

describe("defaultErrorMapper", () => {
  test("maps common typed errors to stable HTTP responses", () => {
    expect(defaultErrorMapper(new AuthError({ message: "Sign in required" }))).toEqual({
      status: 401,
      body: { code: "auth_error", message: "Sign in required" }
    })
    expect(defaultErrorMapper(new AuthorizationError({ message: "Forbidden" }))).toEqual({
      status: 403,
      body: { code: "authorization_error", message: "Forbidden" }
    })
    expect(defaultErrorMapper(new ConflictError({ message: "Already exists" }))).toEqual({
      status: 409,
      body: { code: "conflict", message: "Already exists" }
    })
    expect(
      defaultErrorMapper(new ServiceUnavailableError({ message: "Report service unavailable" }))
    ).toEqual({
      status: 503,
      body: { code: "service_unavailable", message: "Report service unavailable" }
    })
    expect(defaultErrorMapper(new NotFoundError({ message: "Missing" }))).toEqual({
      status: 404,
      body: { code: "not_found", message: "Missing" }
    })
    expect(defaultErrorMapper(new ProviderError({ message: "Provider unavailable" }))).toEqual({
      status: 502,
      body: { code: "provider_error", message: "Upstream provider request failed" }
    })
    expect(defaultErrorMapper(new NotificationError({ message: "Email unavailable" }))).toEqual({
      status: 502,
      body: { code: "notification_error", message: "Email unavailable" }
    })
    expect(
      defaultErrorMapper(
        new VoiceGenerationBlockedError({ reason: "provider_disabled", providerId: "xai" })
      )
    ).toEqual({
      status: 403,
      body: {
        code: "voice_generation_blocked_provider_disabled",
        message: "Voice generation blocked for provider xai"
      }
    })
  })

  test("uses domain reasons when present and keeps default policy codes otherwise", () => {
    expect(
      defaultErrorMapper(
        new EligibilityError({
          message: "Email verification required",
          reason: "email_verification_required"
        })
      )
    ).toEqual({
      status: 403,
      body: { code: "email_verification_required", message: "Email verification required" }
    })
    expect(defaultErrorMapper(new EligibilityError({ message: "Not eligible" }))).toEqual({
      status: 403,
      body: { code: "eligibility_error", message: "Not eligible" }
    })
    expect(
      defaultErrorMapper(
        new ContentPolicyError({ message: "Blocked", reason: "explicit_content_blocked" })
      )
    ).toEqual({
      status: 403,
      body: { code: "content_policy_blocked", message: "Blocked" }
    })
    expect(defaultErrorMapper(new ContentPolicyError({ message: "Blocked" }))).toEqual({
      status: 403,
      body: { code: "content_policy_blocked", message: "Blocked" }
    })
    expect(
      defaultErrorMapper(new ContentPolicyAuditError({ message: "Audit unavailable" }))
    ).toEqual({
      status: 503,
      body: { code: "content_policy_audit_unavailable", message: "Audit unavailable" }
    })
    expect(defaultErrorMapper(new PromptIntegrityError({ message: "Blocked" }))).toEqual({
      status: 403,
      body: { code: "prompt_integrity_blocked", message: "Blocked" }
    })
    expect(
      defaultErrorMapper(new PromptIntegrityAuditError({ message: "Audit unavailable" }))
    ).toEqual({
      status: 503,
      body: { code: "prompt_integrity_audit_unavailable", message: "Audit unavailable" }
    })
  })

  test("maps validation and age-verification signature failures", () => {
    expect(defaultErrorMapper(new ValidationError({ message: "Invalid payload" }))).toEqual({
      status: 400,
      body: { code: "validation_error", message: "Invalid payload" }
    })
    expect(
      defaultErrorMapper(new AgeVerificationSignatureError({ message: "Invalid signature" }))
    ).toEqual({
      status: 401,
      body: {
        code: "age_verification_signature_error",
        message: "Invalid signature"
      }
    })
  })

  test("maps runtime config failures to stable responses", () => {
    expect(defaultErrorMapper({ _tag: "RuntimeConfigNotFound" })).toEqual({
      status: 404,
      body: { code: "runtime_config_not_found", message: "Runtime config key is not recognized" }
    })
    expect(defaultErrorMapper({ _tag: "RuntimeConfigInvalidValue" })).toEqual({
      status: 400,
      body: { code: "runtime_config_invalid_value", message: "Runtime config value is invalid" }
    })
    expect(defaultErrorMapper({ _tag: "RuntimeConfigSecretStoreUnavailable" })).toEqual({
      status: 503,
      body: {
        code: "runtime_config_secret_store_unavailable",
        message: "Runtime config secret store is unavailable"
      }
    })
    expect(defaultErrorMapper({ _tag: "RuntimeConfigVersionConflictError" })).toEqual({
      status: 409,
      body: { code: "runtime_config_version_conflict", message: "Runtime config version conflict" }
    })
  })

  test("maps unknown failures to the internal error response", () => {
    expect(defaultErrorMapper(new Error("boom"))).toEqual({
      status: 500,
      body: {
        code: "internal_error",
        message: "Internal server error"
      }
    })
  })

  test("maps hosted provider failures to generic client messages", () => {
    expect(
      defaultErrorMapper({
        _tag: "HostedGenerationError",
        provider: "xai",
        status: 429,
        message: "rate limit exceeded"
      })
    ).toEqual({
      status: 429,
      body: {
        code: "hosted_generation_error",
        message: "Hosted generation request failed"
      }
    })
  })

  test("maps hosted image moderation failures to content policy responses", () => {
    expect(
      defaultErrorMapper({
        _tag: "HostedGenerationError",
        provider: "xai",
        status: 400,
        message:
          '{"code":"Client specified an invalid argument","error":"Generated image rejected by content moderation."}'
      })
    ).toEqual({
      status: 400,
      body: {
        code: "content_policy_blocked",
        message: "Generated image rejected by content moderation."
      }
    })
  })

  test("maps hosted moderation without status to 400 for CloudFront same-origin clients", () => {
    expect(
      defaultErrorMapper({
        _tag: "HostedGenerationError",
        provider: "xai",
        message: "Generated image rejected by content moderation."
      })
    ).toEqual({
      status: 400,
      body: {
        code: "content_policy_blocked",
        message: "Generated image rejected by content moderation."
      }
    })
  })

  test("hides nested provider message fields from non-moderated JSON error bodies", () => {
    expect(
      defaultErrorMapper({
        _tag: "HostedGenerationError",
        provider: "xai",
        status: 400,
        message: '{"message":"Provider rejected the request"}'
      })
    ).toEqual({
      status: 400,
      body: {
        code: "hosted_generation_error",
        message: "Hosted generation request failed"
      }
    })
  })

  test("maps non-moderated hosted failures without status to 502", () => {
    expect(
      defaultErrorMapper({
        _tag: "HostedGenerationError",
        provider: "openrouter",
        message: "upstream unavailable"
      })
    ).toEqual({
      status: 502,
      body: {
        code: "hosted_generation_error",
        message: "Hosted generation request failed"
      }
    })
  })

  test("maps safety signal failures and audit unavailability", () => {
    expect(
      defaultErrorMapper({
        _tag: "SafetySignalError",
        message: "Self-harm signal detected"
      })
    ).toEqual({
      status: 403,
      body: { code: "safety_signal_intervention", message: "Self-harm signal detected" }
    })
    expect(
      defaultErrorMapper({
        _tag: "SafetySignalAuditError",
        message: "Safety audit store unavailable"
      })
    ).toEqual({
      status: 503,
      body: { code: "safety_signal_audit_unavailable", message: "Safety audit store unavailable" }
    })
  })

  test("maps persistence, rate limit, voice routing, and CSAM errors", () => {
    expect(
      defaultErrorMapper({
        _tag: "PersistenceInvariantError",
        message: "Expected insert to return one row"
      })
    ).toEqual({
      status: 500,
      body: { code: "persistence_invariant", message: "Persistence invariant violated" }
    })
    expect(
      defaultErrorMapper({
        _tag: "RateLimitError",
        message: "Too many requests"
      })
    ).toEqual({
      status: 429,
      body: { code: "rate_limit_exceeded", message: "Too many requests" }
    })
    expect(
      defaultErrorMapper({
        _tag: "VoiceProviderRoutingError",
        reason: "voice_disabled",
        providerId: "xai",
        message: "Voice disabled"
      })
    ).toEqual({
      status: 403,
      body: {
        code: "voice_provider_routing_voice_disabled",
        message: "Voice provider routing blocked for provider xai"
      }
    })
    expect(
      defaultErrorMapper({
        _tag: "CsamDetectionError",
        reason: "vendor_unavailable",
        message: "Vendor unavailable"
      })
    ).toEqual({
      status: 503,
      body: { code: "csam_detection_vendor_unavailable", message: "Vendor unavailable" }
    })
    expect(
      defaultErrorMapper({
        _tag: "CsamPresentationError",
        message: "Invalid field",
        field: "summary"
      })
    ).toEqual({
      status: 400,
      body: { code: "csam_presentation_error", message: "Invalid field" }
    })
    expect(
      defaultErrorMapper({
        _tag: "SetupFormatRegistryError",
        reason: "format_not_registered",
        message: "Unknown format",
        lookup: "foo"
      })
    ).toEqual({
      status: 400,
      body: { code: "setup_format_registry_format_not_registered", message: "Unknown format" }
    })
  })

  test("falls back when hosted provider messages are not JSON", () => {
    expect(
      defaultErrorMapper({
        _tag: "HostedGenerationError",
        provider: "xai",
        status: 503,
        message: "plain upstream failure"
      })
    ).toEqual({
      status: 503,
      body: {
        code: "hosted_generation_error",
        message: "Hosted generation request failed"
      }
    })
  })

  test("maps hosted failures with out-of-range status to 502", () => {
    expect(
      defaultErrorMapper({
        _tag: "HostedGenerationError",
        provider: "xai",
        status: 999,
        message: "unexpected status"
      })
    ).toEqual({
      status: 502,
      body: {
        code: "hosted_generation_error",
        message: "Hosted generation request failed"
      }
    })
  })

  test("maps persistence, rate limit, and portability tagged errors", () => {
    expect(
      defaultErrorMapper({
        _tag: "PersistenceInvariantError",
        operation: "cryptoInvoices.create",
        message: "Expected cryptoInvoices.create to return one row"
      })
    ).toEqual({
      status: 500,
      body: {
        code: "persistence_invariant",
        message: "Persistence invariant violated"
      }
    })
    expect(
      defaultErrorMapper({
        _tag: "RandomUuidUnavailableError",
        message: "crypto.randomUUID is not available in this runtime"
      })
    ).toEqual({
      status: 503,
      body: {
        code: "random_uuid_unavailable",
        message: "crypto.randomUUID is not available in this runtime"
      }
    })
    expect(
      defaultErrorMapper({
        _tag: "RateLimitError",
        message: "Too many requests",
        decision: {
          allowed: false,
          limit: 10,
          remaining: 0,
          resetAtEpochMs: 1
        }
      })
    ).toEqual({
      status: 429,
      body: { code: "rate_limit_exceeded", message: "Too many requests" }
    })
    expect(
      defaultErrorMapper({
        _tag: "VoiceProviderRoutingError",
        reason: "voice_disabled",
        providerId: "xai",
        message: "Voice disabled"
      })
    ).toEqual({
      status: 403,
      body: {
        code: "voice_provider_routing_voice_disabled",
        message: "Voice provider routing blocked for provider xai"
      }
    })
    expect(
      defaultErrorMapper({
        _tag: "SetupFormatAdapterError",
        message: "Invalid payload",
        formatId: "character_card_v2",
        reason: "invalid_payload"
      })
    ).toEqual({
      status: 400,
      body: {
        code: "setup_format_adapter_invalid_payload",
        message: "Invalid payload"
      }
    })
  })

  test("does not leak ProviderError internal messages to clients", () => {
    const internalMessage = "OpenRouter API key invalid: sk-secret-abc"
    const response = defaultErrorMapper(new ProviderError({ message: internalMessage }))

    expect(response.body.message).toBe("Upstream provider request failed")
    expect(response.body.message).not.toBe(internalMessage)
    expect(JSON.stringify(response.body)).not.toContain("sk-secret")
  })

  test("does not leak PersistenceInvariantError operation details to clients", () => {
    const response = defaultErrorMapper({
      _tag: "PersistenceInvariantError",
      operation: "users.insert",
      message: "Expected users.insert to return one row but got 0"
    })

    expect(response.body.message).toBe("Persistence invariant violated")
    expect(JSON.stringify(response.body)).not.toContain("users.insert")
    expect(JSON.stringify(response.body)).not.toContain("Expected users.insert")
  })

  test("does not leak HostedGenerationError provider payloads to clients", () => {
    const response = defaultErrorMapper({
      _tag: "HostedGenerationError",
      provider: "openrouter",
      status: 401,
      message: '{"error":"Invalid API key","key":"sk-live-leaked"}'
    })

    expect(response.body.message).toBe("Hosted generation request failed")
    expect(JSON.stringify(response.body)).not.toContain("sk-live-leaked")
    expect(JSON.stringify(response.body)).not.toContain("Invalid API key")
    expect(response.body.code).toBe("hosted_generation_error")
  })

  test("maps CSAM tagged errors to stable HTTP responses", () => {
    expect(
      defaultErrorMapper({
        _tag: "CsamDetectionError",
        message: "Scanner unavailable",
        reason: "provider_unavailable"
      })
    ).toEqual({
      status: 503,
      body: {
        code: "csam_detection_provider_unavailable",
        message: "Scanner unavailable"
      }
    })
    expect(
      defaultErrorMapper({
        _tag: "CsamPresentationError",
        message: "Presentation blocked"
      })
    ).toEqual({
      status: 400,
      body: { code: "csam_presentation_error", message: "Presentation blocked" }
    })
    expect(
      defaultErrorMapper({
        _tag: "CsamEscalationError",
        message: "Escalation blocked",
        reason: "case_closed"
      })
    ).toEqual({
      status: 403,
      body: {
        code: "csam_escalation_case_closed",
        message: "Escalation blocked"
      }
    })
  })
})
