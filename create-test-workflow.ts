import { PrismaClient } from "./src/generated/prisma";
import { NodeType } from "./src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // Find user by email
  const user = await prisma.user.findFirst({
    where: {
      email: "anurag789p@gmail.com",
    },
  });

  if (!user) {
    console.error("User not found in DB!");
    return;
  }

  // Find their Gmail credential
  const credential = await prisma.credential.findFirst({
    where: {
      userId: user.id,
      type: "GMAIL",
    },
  });

  if (!credential) {
    console.error("Gmail credential not found for user!");
    return;
  }

  console.log(`Found user: ${user.email} (${user.id})`);
  console.log(`Found Gmail credential: ${credential.name} (${credential.id})`);

  // Create test workflow
  const workflow = await prisma.workflow.create({
    data: {
      name: "Gmail Test Workflow",
      userId: user.id,
    },
  });

  // Create Trigger node
  const triggerNode = await prisma.node.create({
    data: {
      workflowId: workflow.id,
      name: "Manual Trigger",
      type: NodeType.MANUAL_TRIGGER,
      position: { x: 100, y: 200 },
      data: { variableName: "trigger" },
    },
  });

  // Create Gmail node
  const gmailNode = await prisma.node.create({
    data: {
      workflowId: workflow.id,
      name: "Send Test Email",
      type: NodeType.GMAIL,
      position: { x: 400, y: 200 },
      credentialId: credential.id,
      data: {
        variableName: "sent_email",
        credentialId: credential.id,
        to: "anurag789p@gmail.com", // send to self
        subject: "Orcha Automation Test Success! 🎉",
        body: "Hi Anurag,\n\nYour Gmail connection is working perfectly! This email was sent automatically via the Orcha automation engine.\n\nBest,\nOrcha AI Node",
      },
    },
  });

  // Connect trigger to Gmail node
  await prisma.connection.create({
    data: {
      workflowId: workflow.id,
      fromNodeId: triggerNode.id,
      toNodeId: gmailNode.id,
    },
  });

  console.log(`Successfully created Gmail Test Workflow! ID: ${workflow.id}`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
