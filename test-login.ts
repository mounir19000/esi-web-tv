import 'dotenv/config';
import prisma from './src/lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  const teacherPassword = await bcrypt.hash('teacher', 10);
  const studentPassword = await bcrypt.hash('student', 10);
  
  await prisma.user.updateMany({
    where: { email: 'teacher@esi.dz' },
    data: { password: teacherPassword }
  });

  await prisma.user.updateMany({
    where: { email: 'student@esi.dz' },
    data: { password: studentPassword }
  });
  console.log('Updated mock users passwords');
}

main().catch(console.error).finally(() => prisma.$disconnect());
