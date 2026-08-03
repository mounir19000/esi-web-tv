"use server"

import prisma from "@/lib/prisma"
import { auth } from "@/auth"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { Role } from "@prisma/client"

export async function createUser(formData: FormData) {
  const session = await auth()
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Unauthorized: Only Admins can create users.")
  }

  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const role = formData.get("role") as Role
  const yearGroup = formData.get("yearGroup") as string | undefined

  if (!name || !email || !password || !role) {
    throw new Error("Missing required fields")
  }

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    throw new Error("Email already in use")
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role,
      yearGroup: yearGroup || null,
    }
  })

  revalidatePath("/dashboard/users")
}

export async function deleteUser(id: string) {
  const session = await auth()
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Unauthorized: Only Admins can delete users.")
  }

  await prisma.user.delete({ where: { id } })
  revalidatePath("/dashboard/users")
}
