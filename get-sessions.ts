import { PrismaClient } from "./src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: {
      email: "anurag789p@gmail.com",
    },
    include: {
      sessions: true,
    },
  });

  if (!user) {
    console.error("User not found!");
    return;
  }

  console.log("Sessions for user:", user.email);
  console.log(JSON.stringify(user.sessions, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
