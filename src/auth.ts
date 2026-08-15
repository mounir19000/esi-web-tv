import NextAuth from "next-auth"
import type { Provider } from "@auth/core/providers"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "./lib/prisma"
import bcrypt from "bcryptjs"
import CredentialsProvider from "next-auth/providers/credentials"
import { AuditEventType, ProvisioningStatus } from "@prisma/client"
import { recordAuditEvent } from "./lib/audit"
import { appConfig } from "./lib/env"
import { checkRateLimit } from "./lib/rate-limit"

const ESI_EMAIL_DOMAIN = "@esi.dz"
const roles = ["GUEST", "STUDENT", "TEACHER", "ADMIN"] as const
const credentialRateLimitWindowMs = 15 * 60 * 1000
const credentialRateLimitMax = 10

function isRole(value: unknown): value is (typeof roles)[number] {
  return typeof value === "string" && roles.includes(value as (typeof roles)[number])
}

function isProvisioningStatus(value: unknown): value is ProvisioningStatus {
  return typeof value === "string" && Object.values(ProvisioningStatus).includes(value as ProvisioningStatus)
}

const providers: Provider[] = [
  CredentialsProvider({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = String(credentials?.email || "").trim().toLowerCase()
      const password = String(credentials?.password || "")

      if (!email || !password || !email.endsWith(ESI_EMAIL_DOMAIN)) {
        return null
      }

      const rateLimit = checkRateLimit(
        `credentials:${email}`,
        credentialRateLimitMax,
        credentialRateLimitWindowMs,
      )
      if (!rateLimit.allowed) {
        return null
      }

      const userRecord = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          password: true,
          role: true,
          yearGroup: true,
          provisioningStatus: true,
          isActive: true,
          disabledAt: true,
          sessionVersion: true,
        },
      })
      if (!userRecord?.password || !userRecord.isActive || userRecord.disabledAt) {
        return null
      }

      const isPasswordValid = await bcrypt.compare(password, userRecord.password)
      if (!isPasswordValid) {
        return null
      }

      return {
        id: userRecord.id,
        name: userRecord.name,
        email: userRecord.email,
        image: userRecord.image,
        role: userRecord.role,
        yearGroup: userRecord.yearGroup,
        provisioningStatus: userRecord.provisioningStatus,
        isActive: userRecord.isActive,
        sessionVersion: userRecord.sessionVersion,
      }
    },
  }),
]

if (appConfig.auth.google.enabled) {
  providers.push(
    Google({
      clientId: appConfig.auth.google.clientId,
      clientSecret: appConfig.auth.google.clientSecret,
    }),
  )
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: appConfig.auth.secret,
  providers,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase()
      if (!email?.endsWith(ESI_EMAIL_DOMAIN)) {
        return false
      }

      const filters = [
        typeof user.id === "string" ? { id: user.id } : null,
        email ? { email } : null,
      ].filter((filter): filter is { id: string } | { email: string } => Boolean(filter))

      if (filters.length > 0) {
        const userRecord = await prisma.user.findFirst({
          where: { OR: filters },
          select: { isActive: true, disabledAt: true },
        })

        if (userRecord && (!userRecord.isActive || userRecord.disabledAt)) {
          return false
        }
      }

      return true
    },
    async jwt({ token, user }) {
      const userId = user?.id || (typeof token.sub === "string" ? token.sub : null)

      if (!userId) {
        token.revoked = true
        return token
      }

      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          yearGroup: true,
          provisioningStatus: true,
          isActive: true,
          disabledAt: true,
          sessionVersion: true,
        },
      })

      if (!userRecord?.isActive || userRecord.disabledAt) {
        token.revoked = true
        token.isActive = false
        token.role = "GUEST"
        token.yearGroup = null
        delete token.sessionVersion
        return token
      }

      if (
        typeof token.sessionVersion === "number" &&
        token.sessionVersion !== userRecord.sessionVersion
      ) {
        token.revoked = true
        token.isActive = false
        token.role = "GUEST"
        token.yearGroup = null
        delete token.sessionVersion
        return token
      }

      token.sub = userRecord.id
      token.revoked = false
      token.isActive = true
      token.role = userRecord.provisioningStatus === ProvisioningStatus.APPROVED ? userRecord.role : "GUEST"
      token.yearGroup = userRecord.yearGroup
      token.provisioningStatus = userRecord.provisioningStatus
      token.sessionVersion = userRecord.sessionVersion
      return token
    },
    async session({ session, token }) {
      if (session.user && token && !token.revoked && token.sub) {
        session.user.id = token.sub as string
        session.user.role = isRole(token.role) ? token.role : "GUEST"
        session.user.yearGroup = typeof token.yearGroup === "string" ? token.yearGroup : null
        session.user.provisioningStatus = isProvisioningStatus(token.provisioningStatus)
          ? token.provisioningStatus
          : ProvisioningStatus.PENDING
        session.user.isActive = token.isActive !== false
        session.user.sessionVersion =
          typeof token.sessionVersion === "number" ? token.sessionVersion : undefined
      } else if (session.user) {
        session.user.id = ""
        session.user.role = "GUEST"
        session.user.yearGroup = null
        session.user.provisioningStatus = ProvisioningStatus.PENDING
        session.user.isActive = false
        session.user.sessionVersion = undefined
      }
      return session
    }
  },
  events: {
    async createUser({ user }) {
      if (user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            role: "GUEST",
            yearGroup: null,
            provisioningStatus: ProvisioningStatus.PENDING,
          },
        })
      }
    },
    async signIn({ user }) {
      if (user.id) {
        await recordAuditEvent({
          type: AuditEventType.LOGIN,
          subjectId: user.id,
        })
      }
    },
    async signOut(message) {
      const token = "token" in message ? message.token : null
      const subjectId = typeof token?.sub === "string" ? token.sub : null

      if (subjectId) {
        await recordAuditEvent({
          type: AuditEventType.LOGOUT,
          subjectId,
        })
      }
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
    updateAge: 15 * 60,
  }
})
