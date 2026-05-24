import { google } from "googleapis";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

export async function sendGmail(
  userId: string,
  params: { to: string; subject: string; body: string; credentialId: string }
) {
  // Load stored credential from DB
  const cred = await prisma.credential.findUnique({
    where: { id: params.credentialId, userId },
  });

  if (!cred) throw new Error("Gmail credential not found");

  // Decrypt the stored tokens
  const { refresh_token, email } = JSON.parse(decrypt(cred.value));

  // Set up OAuth client with the user's refresh token
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({ refresh_token });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Build the RFC 2822 email format
  const rawEmail = [
    `From: ${email}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    params.body,
  ].join("\r\n");

  const encodedEmail = Buffer.from(rawEmail).toString("base64url");

  const sent = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedEmail },
  });

  return {
    success: true,
    messageId: sent.data.id,
    to: params.to,
    subject: params.subject,
  };
}
