import type { DefaultSession } from "next-auth"
import type { ProvisioningStatus, Role } from "@prisma/client"

declare module "next-auth" {
  /**
   * Returned by `auth`, `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      /** The user's id. */
      id: string
      role: Role
      yearGroup?: string | null
      provisioningStatus?: ProvisioningStatus
      isActive?: boolean
      sessionVersion?: number
    } & DefaultSession["user"]
  }

  interface User {
    role?: Role
    yearGroup?: string | null
    provisioningStatus?: ProvisioningStatus
    isActive?: boolean
    sessionVersion?: number
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role
    yearGroup?: string | null
    provisioningStatus?: ProvisioningStatus
    isActive?: boolean
    revoked?: boolean
    sessionVersion?: number
  }
}
