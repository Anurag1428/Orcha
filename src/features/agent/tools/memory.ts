import prisma from "@/lib/db";

export async function rememberFact(
  userId: string,
  key: string,
  value: string
) {
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  const context = (profile?.context as Record<string, string>) ?? {};
  context[key] = value;

  await prisma.userProfile.upsert({
    where: { userId },
    update: { context },
    create: { userId, context },
  });

  return { remembered: true, key, value };
}

export async function getProfile(userId: string) {
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  return profile?.context ?? {};
}

export async function getCredentials(userId: string, type?: string) {
  return prisma.credential.findMany({
    where: { userId, ...(type ? { type: type as any } : {}) },
    select: { id: true, name: true, type: true },
  });
}
