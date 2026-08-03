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
    const existingModule = await prisma.module.findFirst({
      where: { name: m.name, yearGroup: m.yearGroup },
    })

    if (!existingModule) {
      await prisma.module.create({ data: m })
    }
  }
  
  console.log('Modules seeded successfully!')

  console.log('Seeding admin user...')
  const hashedPassword = await bcrypt.hash('admin', 10)
  
  await prisma.user.upsert({
    where: { email: 'admin@esi.dz' },
    update: { name: 'Super Admin', password: hashedPassword, role: 'ADMIN', yearGroup: null },
    create: {
      name: 'Super Admin',
      email: 'admin@esi.dz',
      password: hashedPassword,
      role: 'ADMIN',
    },
  })
  console.log('Admin seeded successfully!')

  console.log('Seeding teacher and student for tests...')
  const teacherPassword = await bcrypt.hash('teacher', 10)
  const studentPassword = await bcrypt.hash('student', 10)

  await prisma.user.upsert({
    where: { email: 'teacher@esi.dz' },
    update: { name: 'Test Teacher', password: teacherPassword, role: 'TEACHER', yearGroup: null },
    create: { name: 'Test Teacher', email: 'teacher@esi.dz', password: teacherPassword, role: 'TEACHER' },
  })

  await prisma.user.upsert({
    where: { email: 'student@esi.dz' },
    update: { name: 'Test Student', password: studentPassword, role: 'STUDENT', yearGroup: '1CP' },
    create: { name: 'Test Student', email: 'student@esi.dz', password: studentPassword, role: 'STUDENT', yearGroup: '1CP' },
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
