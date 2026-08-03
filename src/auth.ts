import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "./lib/prisma"
import { Role } from "@prisma/client"
import bcrypt from "bcryptjs"

import CredentialsProvider from "next-auth/providers/credentials"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        console.log("Authorize called with email:", credentials?.email);
        if (!credentials?.email || !credentials?.password) {
          console.log("Missing email or password");
          return null;
        }
        
        const email = credentials.email as string;
        const password = credentials.password as string;
        
        const userRecord = await prisma.user.findUnique({ where: { email } });
        console.log("Found user:", userRecord?.email, "Has password:", !!userRecord?.password);
        
        if (!userRecord || !userRecord.password) {
          console.log("User not found or has no password");
          return null; // User not found or has no password
        }

        const isPasswordValid = await bcrypt.compare(password, userRecord.password);
        console.log("Is password valid:", isPasswordValid);
        if (!isPasswordValid) {
          console.log("Password invalid");
          return null;
        }

        return {
          id: userRecord.id,
          name: userRecord.name,
          email: userRecord.email,
          role: userRecord.role,
          yearGroup: userRecord.yearGroup,
        } as any;
      }
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.yearGroup = (user as any).yearGroup
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.sub as string
        ;(session.user as any).role = token.role as any
        ;(session.user as any).yearGroup = token.yearGroup as any
      }
      return session
    }
  },
  session: {
    strategy: "jwt"
  }
})
