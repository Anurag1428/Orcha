import { PrismaClient, CredentialType } from './src/generated/prisma';
import { encrypt } from './src/lib/encryption';

const prisma = new PrismaClient();

async function main() {
  const userId = 'Bbaay0kt2xbJT1e3mvimXMLnu8BQ4J41';
  const apiKey = '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'; // from test-nemotron.mjs

  // Check if OPENAI credential already exists for this user
  let cred = await prisma.credential.findFirst({
    where: { userId, type: CredentialType.OPENAI }
  });

  if (!cred) {
    cred = await prisma.credential.create({
      data: {
        name: 'NVIDIA API Key',
        value: encrypt(apiKey),
        type: CredentialType.OPENAI,
        userId: userId,
      }
    });
    console.log('Created new credential with ID:', cred.id);
  } else {
    console.log('Credential already exists with ID:', cred.id);
    // Update value just in case
    await prisma.credential.update({
      where: { id: cred.id },
      data: { value: encrypt(apiKey) }
    });
  }
}

main().finally(() => prisma.$disconnect());
