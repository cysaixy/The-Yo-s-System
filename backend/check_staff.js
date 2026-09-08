import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function check() {
  const staff = await prisma.staff.findUnique({ 
    where: { email: 'admin@theyos.com' },
    select: { id: true, email: true, password: true, role: true, status: true } 
  });
  console.log('Staff:', staff);
  
  // Test a common password
  if (staff?.password) {
    const testPass = 'admin123';
    const match = await bcrypt.compare(testPass, staff.password);
    console.log('Password "admin123" matches:', match);
  }
  await prisma.$disconnect();
}
check();