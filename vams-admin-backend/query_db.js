const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("--- COMPANIES ---");
  const companies = await prisma.company.findMany({
    include: { settings: true }
  });
  console.log(JSON.stringify(companies, null, 2));

  console.log("--- USERS ---");
  const users = await prisma.user.findMany();
  console.log(JSON.stringify(users, null, 2));

  console.log("--- ALERTS ---");
  const alerts = await prisma.alert.findMany();
  console.log(JSON.stringify(alerts, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
