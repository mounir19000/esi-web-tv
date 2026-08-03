import NextAuth from "next-auth"
import type { Provider } from "@auth/core/providers"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "./lib/prisma"
import bcrypt from "bcryptjs"
import CredentialsProvider from "next-auth/providers/credentials"

const ESI_EMAIL_DOMAIN = "@esi.dz"
const roles = ["GUEST", "STUDENT", "TEACHER", "ADMIN"] as const

function isRole(value: unknown): value is (typeof roles)[number] {
  return typeof value === "string" && roles.includes(value as (typeof roles)[number])
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

      const userRecord = await prisma.user.findUnique({ where: { email } })
      if (!userRecord?.password) {
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
      }
    },
  }),
]

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  )
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
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
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role ?? "GUEST"
        token.yearGroup = user.yearGroup
      } else if (token.email && !token.role) {
        const userRecord = await prisma.user.findUnique({
          where: { email: token.email },
          select: { role: true, yearGroup: true },
        })
        token.role = userRecord?.role
        token.yearGroup = userRecord?.yearGroup
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.sub as string
        session.user.role = isRole(token.role) ? token.role : "GUEST"
        session.user.yearGroup = typeof token.yearGroup === "string" ? token.yearGroup : null
      }
      return session
    }
  },
  session: {
    strategy: "jwt"
  }
})
