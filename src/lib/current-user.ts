import { Role, type Prisma } from "@prisma/client"
import { auth } from "@/auth"
import { isEducator } from "@/lib/content-access"
import prisma from "@/lib/prisma"

export class AuthenticationError extends Error {
  constructor(message = "Sign in required") {
    super(message)
    this.name = "AuthenticationError"
  }
}

export class AuthorizationError extends Error {
  constructor(message = "Forbidden") {
    super(message)
    this.name = "AuthorizationError"
  }
}

export const currentUserSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  yearGroup: true,
  isActive: true,
  disabledAt: true,
  sessionVersion: true,
} satisfies Prisma.UserSelect

export type CurrentUser = Prisma.UserGetPayload<{ select: typeof currentUserSelect }>

type SessionUserSnapshot = {
  id?: string | null
  sessionVersion?: number | null
}

export function resolveCurrentUserFromSession(
  sessionUser: SessionUserSnapshot | undefined | null,
  user: CurrentUser | undefined | null,
) {
  if (!sessionUser?.id || !user?.isActive || user.disabledAt) {
    return null
  }

  if (
    typeof sessionUser.sessionVersion === "number" &&
    sessionUser.sessionVersion !== user.sessionVersion
  ) {
    return null
  }

  return user
}

export async function getCurrentAuth() {
  const session = await auth()
  const sessionUser = session?.user

  if (!sessionUser?.id) {
    return { session, user: null }
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: currentUserSelect,
  })

  return {
    session,
    user: resolveCurrentUserFromSession(sessionUser, user),
  }
}

export async function getCurrentUser() {
  const { user } = await getCurrentAuth()
  return user
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) {
    throw new AuthenticationError()
  }

  return user
}

export async function requireEducator() {
  const user = await requireUser()
  if (!isEducator(user.role)) {
    throw new AuthorizationError()
  }

  return user
}

export async function requireAdmin() {
  const user = await requireUser()
  if (user.role !== Role.ADMIN) {
    throw new AuthorizationError()
  }

  return user
}

export function authErrorStatus(error: unknown) {
  if (error instanceof AuthenticationError) {
    return 401
  }

  if (error instanceof AuthorizationError) {
    return 403
  }

  return null
}
