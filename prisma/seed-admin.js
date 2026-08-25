const { PrismaClient } = require('./client');
const { hashPassword } = require('../utils/passwords');

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME && process.env.ADMIN_USERNAME.trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME && process.env.ADMIN_NAME.trim();

  if (!username || !password) {
    console.log('ADMIN_USERNAME or ADMIN_PASSWORD not set. Skipping admin seed.');
    return;
  }

  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters long.');
  }

  await prisma.admin.upsert({
    where: { username },
    update: {
      password: hashPassword(password),
      name: name || null
    },
    create: {
      username,
      password: hashPassword(password),
      name: name || null
    }
  });

  console.log(`Admin user "${username}" is ready.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

