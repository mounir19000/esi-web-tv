import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "./lib/prisma"
import { Role } from "@prisma/client"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        // Restrict sign in to @esi.dz domain
        return profile?.email?.endsWith("@esi.dz") ?? false
      }
      return true
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
        // We typecast or extend the type in next-auth.d.ts later
        ;(session.user as any).role = (user as any).role
        ;(session.user as any).yearGroup = (user as any).yearGroup
      }
      return session
    }
  }
})
