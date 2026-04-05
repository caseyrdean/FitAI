import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.upsert({
    where: { id: "local-user" },
    update: {},
    create: { id: "local-user" },
  });

  await prisma.healthProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      onboardingComplete: false,
    },
  });

  console.log("Seeded user:", user.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
