import { config } from "dotenv";
config();

import { PrismaClient } from "./src/generated/prisma";
import Cryptr from "cryptr";
import { google } from "googleapis";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: {
      email: "anurag789p@gmail.com",
    },
  });

  if (!user) {
    console.error("User not found!");
    return;
  }

  const credentials = await prisma.credential.findMany({
    where: {
      userId: user.id,
      type: "GMAIL",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (credentials.length === 0) {
    console.error("Gmail credential not found!");
    return;
  }

  console.log(`Found ${credentials.length} Gmail credentials. Using the latest one:`);
  for (const cred of credentials) {
    console.log(`- ID: ${cred.id}, Name: ${cred.name}, Created: ${cred.createdAt}`);
  }

  const credential = credentials[0];

  // Decrypt credential
  const cryptr = new Cryptr(process.env.ENCRYPTION_KEY!);
  const decryptedValue = cryptr.decrypt(credential.value);
  const { refresh_token, email } = JSON.parse(decryptedValue) as {
    refresh_token: string;
    email: string;
  };

  console.log(`Decrypted email: ${email}`);

  // Set up OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  oauth2Client.setCredentials({ refresh_token });

  console.log("Fetching token info to inspect scopes...");
  try {
    const tokenInfo = await oauth2Client.getTokenInfo(oauth2Client.credentials.access_token || "");
    console.log("Token scopes:", tokenInfo.scopes);
  } catch (err: any) {
    console.log("Could not get token info using access_token directly, trying to refresh access token first...");
    const { token } = await oauth2Client.getAccessToken();
    if (token) {
      const tokenInfo = await oauth2Client.getTokenInfo(token);
      console.log("Token scopes:", tokenInfo.scopes);
    } else {
      console.error("Failed to refresh access token!");
    }
  }

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Build RFC 2822 email
  const to = "anurag789p@gmail.com";
  const subject = "Orcha Gmail Connection Direct Test! 🚀";
  const body = "Hi Anurag,<br><br>This is a direct API test of your Gmail connection to verify that Orcha can send emails successfully.<br><br>Best,<br>Antigravity AI";

  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;

  const rawMessage = [
    `From: ${email}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    ``,
    body,
  ].join("\r\n");

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  console.log("Sending email via Gmail API...");
  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
    },
  });

  console.log("Email sent successfully!");
  console.log("Response status:", response.status);
  console.log("Response data:", response.data);
}

main()
  .catch((e) => console.error("Error testing Gmail:", e))
  .finally(() => prisma.$disconnect());
