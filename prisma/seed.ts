import 'dotenv/config'

import prisma from '../src/lib/prisma'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { appConfig } from '../src/lib/env'

type DemoAccount = {
  email: string
  name: string
  role: 'ADMIN' | 'TEACHER' | 'STUDENT'
  yearGroup: string | null
  passwordEnvName: string
}

const forbiddenDemoPasswords = new Set(['admin', 'teacher', 'student', 'password', 'secret'])

const demoAccounts: DemoAccount[] = [
  {
    email: 'admin@esi.dz',
    name: 'Super Admin',
    role: 'ADMIN',
    yearGroup: null,
    passwordEnvName: 'DEMO_ADMIN_PASSWORD',
  },
  {
    email: 'teacher@esi.dz',
    name: 'Test Teacher',
    role: 'TEACHER',
    yearGroup: null,
    passwordEnvName: 'DEMO_TEACHER_PASSWORD',
  },
  {
    email: 'student@esi.dz',
    name: 'Test Student',
    role: 'STUDENT',
    yearGroup: '1CP',
    passwordEnvName: 'DEMO_STUDENT_PASSWORD',
  },
]

function getDemoPassword(account: DemoAccount) {
  const configuredPassword = process.env[account.passwordEnvName]?.trim()
  if (configuredPassword) {
    if (configuredPassword.length < 12 || forbiddenDemoPasswords.has(configuredPassword.toLowerCase())) {
      throw new Error(`${account.passwordEnvName} must be at least 12 characters and not a known demo password.`)
    }

    return configuredPassword
  }

  const generatedPassword = randomBytes(18).toString('base64url')
  console.log(`Generated ${account.email} demo password: ${generatedPassword}`)
  return generatedPassword
}

async function main() {
  console.log('Seeding modules...')
  
  const modules = [
    { name: 'Introduction to Web Development', yearGroup: '1CP' },
    { name: 'Algorithms & Data Structures', yearGroup: '2CP' },
    { name: 'Database Systems', yearGroup: '1CS' },
    { name: 'Software Engineering', yearGroup: '2CS' },
    { name: 'Artificial Intelligence', yearGroup: '3CS' }
  ]

  for (const m of modules) {
    await prisma.module.upsert({
      where: {
        name_yearGroup: {
          name: m.name,
          yearGroup: m.yearGroup,
        },
      },
      update: {},
      create: m,
    })
  }
  
  console.log('Modules seeded successfully!')

  if (!appConfig.seed.allowDemoSeed) {
    console.log('Demo users skipped. Set ALLOW_DEMO_SEED=true with APP_ENV=local or APP_ENV=test to create them.')
    return
  }

  if (!appConfig.isLocalLike) {
    throw new Error('Demo users can only be seeded in local or test deployments.')
  }

  console.log('Seeding local/test demo users...')
  for (const account of demoAccounts) {
    const hashedPassword = await bcrypt.hash(getDemoPassword(account), 10)

    await prisma.user.upsert({
      where: { email: account.email },
      update: {
        name: account.name,
        password: hashedPassword,
        role: account.role,
        yearGroup: account.yearGroup,
        isActive: true,
        disabledAt: null,
        sessionVersion: { increment: 1 },
      },
      create: {
        name: account.name,
        email: account.email,
        password: hashedPassword,
        role: account.role,
        yearGroup: account.yearGroup,
        isActive: true,
      },
    })
  }

  console.log('Demo users seeded successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
