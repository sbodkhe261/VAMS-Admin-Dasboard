const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Checking alertDefinition table...");
  try {
    const list = await prisma.alertDefinition.findMany();
    console.log("Existing definitions:", list.length);
  } catch (err) {
    console.error("Failed to query alertDefinition table:", err);
  }
}

main().finally(() => prisma.$disconnect());
