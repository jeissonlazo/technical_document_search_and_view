const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

prisma.user
  .count()
  .then((count) => {
    console.log(`Conexión Neon OK. Usuarios: ${count}`);
    return prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error.message);
    await prisma.$disconnect();
    process.exit(1);
  });
