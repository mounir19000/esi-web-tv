import { AudienceType, ProvisioningStatus, Role, VideoType } from "@prisma/client"

export type FieldErrors = Record<string, string>

export class ValidationError extends Error {
  constructor(
    public readonly fieldErrors: FieldErrors,
    message = "Validation failed",
  ) {
    super(message)
    this.name = "ValidationError"
  }
}

export type ActionResult<T = undefined> = {
  ok: boolean
  message: string
  fieldErrors?: FieldErrors
  data?: T
}

export const validationLimits = {
  nameMax: 120,
  emailMax: 254,
  passwordMin: 12,
  titleMax: 160,
  descriptionMax: 2_000,
  yearGroupMax: 16,
} as const

export function stringInput(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export function optionalString(value: unknown) {
  const normalized = stringInput(value)
  return normalized ? normalized : null
}

export function boundedText(field: string, value: unknown, max: number, errors: FieldErrors, required = false) {
  const normalized = stringInput(value).replace(/\s+/g, " ")
  if (required && !normalized) {
    errors[field] = "Required"
    return ""
  }

  if (normalized.length > max) {
    errors[field] = `Must be ${max} characters or less`
  }

  return normalized
}

export function boundedLongText(field: string, value: unknown, max: number, errors: FieldErrors) {
  const normalized = stringInput(value)
  if (normalized.length > max) {
    errors[field] = `Must be ${max} characters or less`
  }

  return normalized || null
}

export function normalizeEsiEmail(value: unknown, errors: FieldErrors, field = "email") {
  const email = stringInput(value).toLowerCase()
  if (!email) {
    errors[field] = "Email is required"
    return ""
  }

  if (email.length > validationLimits.emailMax || !/^[^@\s]+@esi\.dz$/i.test(email)) {
    errors[field] = "Use a valid @esi.dz email address"
  }

  return email
}

export function parseEnumValue<T extends Record<string, string>>(
  enumObject: T,
  value: unknown,
  field: string,
  errors: FieldErrors,
): T[keyof T] | null {
  const normalized = stringInput(value)
  const values = Object.values(enumObject) as T[keyof T][]
  if (!values.includes(normalized as T[keyof T])) {
    errors[field] = `Must be one of: ${values.join(", ")}`
    return null
  }

  return normalized as T[keyof T]
}

export function parseRole(value: unknown, errors: FieldErrors) {
  return parseEnumValue(Role, value, "role", errors)
}

export function parseProvisioningStatus(value: unknown, errors: FieldErrors) {
  return parseEnumValue(ProvisioningStatus, value, "provisioningStatus", errors)
}

export function parseVideoType(value: unknown, errors: FieldErrors) {
  return parseEnumValue(VideoType, value, "type", errors)
}

export function parseAudience(value: unknown, errors: FieldErrors, fallback?: AudienceType) {
  const normalized = stringInput(value)
  if (!normalized && fallback) {
    return fallback
  }

  return parseEnumValue(AudienceType, normalized, "audience", errors)
}

export function validatePassword(value: unknown, errors: FieldErrors, field = "password") {
  const password = typeof value === "string" ? value : ""
  if (!password) {
    errors[field] = "Password is required"
    return ""
  }

  if (password.length < validationLimits.passwordMin) {
    errors[field] = `Must be at least ${validationLimits.passwordMin} characters`
  }

  return password
}

export function throwIfInvalid(errors: FieldErrors) {
  if (Object.keys(errors).length > 0) {
    throw new ValidationError(errors)
  }
}

export function actionFailure(error: unknown, fallback = "Request failed"): ActionResult {
  if (error instanceof ValidationError) {
    return {
      ok: false,
      message: error.message,
      fieldErrors: error.fieldErrors,
    }
  }

  return {
    ok: false,
    message: error instanceof Error ? error.message : fallback,
  }
}
