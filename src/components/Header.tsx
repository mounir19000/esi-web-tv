import { ProvisioningStatus } from "@prisma/client"
import { getCurrentUser } from "@/lib/current-user"
import HeaderClient, { type HeaderUser } from "@/components/HeaderClient"

export default async function Header() {
  const user = await getCurrentUser()
  const canCreate =
    user?.provisioningStatus === ProvisioningStatus.APPROVED &&
    (user.role === "TEACHER" || user.role === "ADMIN")
  const headerUser: HeaderUser | null = user
    ? {
        name: user.name,
        email: user.email,
      }
    : null

  return <HeaderClient user={headerUser} canCreate={canCreate} />
}
