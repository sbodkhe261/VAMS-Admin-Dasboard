const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Running SQL migrations...");
  
  // Add tier column to companies table
  await prisma.$executeRawUnsafe(`
    ALTER TABLE companies 
    ADD COLUMN IF NOT EXISTS "tier" text DEFAULT 'BASIC';
  `);
  console.log("Added column 'tier' to companies.");

  // Add rulebook column to company_settings table
  await prisma.$executeRawUnsafe(`
    ALTER TABLE company_settings 
    ADD COLUMN IF NOT EXISTS "rulebook" jsonb DEFAULT '{}';
  `);
  console.log("Added column 'rulebook' to company_settings.");

  // Add maxUsers column to company_settings table
  await prisma.$executeRawUnsafe(`
    ALTER TABLE company_settings 
    ADD COLUMN IF NOT EXISTS "maxUsers" integer DEFAULT 0;
  `);
  console.log("Added column 'maxUsers' to company_settings.");

  // Add allowedRoles column to company_settings table
  await prisma.$executeRawUnsafe(`
    ALTER TABLE company_settings 
    ADD COLUMN IF NOT EXISTS "allowedRoles" text[] DEFAULT '{}';
  `);
  console.log("Added column 'allowedRoles' to company_settings.");

  // Add whatsappEnabled column to company_settings table
  await prisma.$executeRawUnsafe(`
    ALTER TABLE company_settings 
    ADD COLUMN IF NOT EXISTS "whatsappEnabled" boolean DEFAULT false;
  `);
  console.log("Added column 'whatsappEnabled' to company_settings.");

  // Add whatsappApiKey column to company_settings table
  await prisma.$executeRawUnsafe(`
    ALTER TABLE company_settings 
    ADD COLUMN IF NOT EXISTS "whatsappApiKey" text;
  `);
  console.log("Added column 'whatsappApiKey' to company_settings.");

  // Add whatsappSenderNum column to company_settings table
  await prisma.$executeRawUnsafe(`
    ALTER TABLE company_settings 
    ADD COLUMN IF NOT EXISTS "whatsappSenderNum" text;
  `);
  console.log("Added column 'whatsappSenderNum' to company_settings.");

  // Add defectName column to alerts table
  await prisma.$executeRawUnsafe(`
    ALTER TABLE alerts 
    ADD COLUMN IF NOT EXISTS "defectName" text;
  `);
  console.log("Added column 'defectName' to alerts.");

  // Add isManual column to alerts table
  await prisma.$executeRawUnsafe(`
    ALTER TABLE alerts 
    ADD COLUMN IF NOT EXISTS "isManual" boolean DEFAULT true;
  `);
  console.log("Added column 'isManual' to alerts.");

  // Add lastReminderSentAt column to alerts table
  await prisma.$executeRawUnsafe(`
    ALTER TABLE alerts 
    ADD COLUMN IF NOT EXISTS "lastReminderSentAt" timestamp;
  `);
  console.log("Added column 'lastReminderSentAt' to alerts.");

  // Add alertId column to alert_definitions table
  await prisma.$executeRawUnsafe(`
    ALTER TABLE alert_definitions 
    ADD COLUMN IF NOT EXISTS "alertId" text DEFAULT '';
  `);
  console.log("Added column 'alertId' to alert_definitions.");

  console.log("SQL Migrations completed successfully!");
}

main()
  .catch(e => console.error("Migration failed:", e))
  .finally(async () => {
    await prisma.$disconnect();
  });
