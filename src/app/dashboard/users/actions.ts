"use server"

import prisma from "@/lib/prisma"
import { auth } from "@/auth"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { Role } from "@prisma/client"

const validRoles = new Set<string>(Object.values(Role))

export async function createUser(formData: FormData) {
  const session = await auth()
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Unauthorized: Only Admins can create users.")
  }

  const name = String(formData.get("name") || "").trim()
  const email = String(formData.get("email") || "").trim().toLowerCase()
  const password = String(formData.get("password") || "")
  const role = String(formData.get("role") || "")
  const yearGroup = String(formData.get("yearGroup") || "").trim().toUpperCase()

  if (!name || !email || !password || !validRoles.has(role)) {
    throw new Error("Missing required fields")
  }

  if (!email.endsWith("@esi.dz")) {
    throw new Error("Only @esi.dz email addresses are allowed")
  }

  if (role === "STUDENT" && !yearGroup) {
    throw new Error("Students need a year group")
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
      role: role as Role,
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

  if (session.user.id === id) {
    throw new Error("Admins cannot delete their own account.")
  }

  await prisma.user.delete({ where: { id } })
  revalidatePath("/dashboard/users")
}
