import "dotenv/config"

import bcrypt from "bcryptjs"
import { randomBytes } from "node:crypto"
import { AuditEventType, Role } from "@prisma/client"
import { appConfig } from "../src/lib/env"
import prisma from "../src/lib/prisma"

function generateBootstrapPassword() {
  return randomBytes(24).toString("base64url")
}

async function main() {
  const email = appConfig.bootstrap.adminEmail
  if (!email) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL is required to bootstrap the first admin.")
  }

  const existingAdmin = await prisma.user.findFirst({
    where: {
      role: Role.ADMIN,
      isActive: true,
    },
    select: { email: true },
  })

  if (existingAdmin) {
    throw new Error(`An active admin already exists (${existingAdmin.email}). Bootstrap is one-time only.`)
  }

  const generatedPassword = !appConfig.bootstrap.adminPassword
  const password = appConfig.bootstrap.adminPassword ?? generateBootstrapPassword()
  const hashedPassword = await bcrypt.hash(password, 12)

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: appConfig.bootstrap.adminName,
      password: hashedPassword,
      role: Role.ADMIN,
      yearGroup: null,
      isActive: true,
      disabledAt: null,
      sessionVersion: { increment: 1 },
    },
    create: {
      name: appConfig.bootstrap.adminName,
      email,
      password: hashedPassword,
      role: Role.ADMIN,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
    },
  })

  await prisma.auditEvent.create({
    data: {
      type: AuditEventType.USER_CREATE,
      subjectId: user.id,
      metadata: {
        source: "bootstrap-admin",
        email: user.email,
        role: Role.ADMIN,
      },
    },
  })

  console.log(`Bootstrapped admin account ${user.email}.`)
  if (generatedPassword) {
    console.log(`Generated one-time admin password: ${password}`)
  } else {
    console.log("Admin password was read from BOOTSTRAP_ADMIN_PASSWORD.")
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
