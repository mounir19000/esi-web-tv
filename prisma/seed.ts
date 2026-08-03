import prisma from '../src/lib/prisma'
import bcrypt from 'bcryptjs'

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
    await prisma.module.create({
      data: m
    })
  }
  
  console.log('Modules seeded successfully!')

  console.log('Seeding admin user...')
  const hashedPassword = await bcrypt.hash('admin', 10)
  
  const adminExists = await prisma.user.findUnique({
    where: { email: 'admin@esi.dz' }
  })
  
  if (!adminExists) {
    await prisma.user.create({
      data: {
        name: 'Super Admin',
        email: 'admin@esi.dz',
        password: hashedPassword,
        role: 'ADMIN',
      }
    })
    console.log('Admin seeded successfully!')
  } else {
    console.log('Admin user already exists.')
  }

  console.log('Seeding teacher and student for tests...')
  const teacherPassword = await bcrypt.hash('teacher', 10)
  const studentPassword = await bcrypt.hash('student', 10)

  const teacherExists = await prisma.user.findUnique({ where: { email: 'teacher@esi.dz' } })
  if (!teacherExists) {
    await prisma.user.create({
      data: { name: 'Test Teacher', email: 'teacher@esi.dz', password: teacherPassword, role: 'TEACHER' }
    })
  }

  const studentExists = await prisma.user.findUnique({ where: { email: 'student@esi.dz' } })
  if (!studentExists) {
    await prisma.user.create({
      data: { name: 'Test Student', email: 'student@esi.dz', password: studentPassword, role: 'STUDENT' }
    })
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
