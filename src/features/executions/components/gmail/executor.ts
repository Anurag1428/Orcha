import Handlebars from "handlebars";
import { decode } from "html-entities";
import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { gmailChannel } from "@/inngest/channels/gmail";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { google } from "googleapis";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);

  return safeString;
});

type GmailData = {
  variableName?: string;
  credentialId?: string;
  to?: string;
  subject?: string;
  body?: string;
};

export const gmailExecutor: NodeExecutor<GmailData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(
    gmailChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  if (!data.to) {
    await publish(
      gmailChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw new NonRetriableError("Gmail node: Recipient (to) is required");
  }

  if (!data.credentialId) {
    await publish(
      gmailChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw new NonRetriableError("Gmail node: Credential ID is required");
  }

  // Compile Handlebars templates
  const rawTo = Handlebars.compile(data.to)(context);
  const to = decode(rawTo);

  let subject = data.subject
    ? decode(Handlebars.compile(data.subject)(context))
    : "";

  let body = data.body
    ? decode(Handlebars.compile(data.body)(context))
    : "";

  // The body might be a JSON string from an AI node (e.g. {"subject":"...","body":"..."})
  // If it parses as JSON with subject and body keys, use those values instead.
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "subject" in parsed && "body" in parsed) {
      subject = parsed.subject;
      body = parsed.body;
    }
  } catch {
    // Not JSON, use the raw compiled values
  }

  try {
    const result = await step.run("gmail-send", async () => {
      // Fetch and decrypt credential
      const credential = await prisma.credential.findUniqueOrThrow({
        where: { id: data.credentialId },
      });

      const decryptedValue = decrypt(credential.value);
      const { refresh_token, email } = JSON.parse(decryptedValue) as {
        refresh_token: string;
        email: string;
      };

      // Set up OAuth2 client
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI,
      );

      oauth2Client.setCredentials({ refresh_token });

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      // Build RFC 2822 email
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

      await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedMessage,
        },
      });

      if (!data.variableName) {
        await publish(
          gmailChannel().status({
            nodeId,
            status: "error",
          })
        );
        throw new NonRetriableError("Gmail node: Variable name is missing");
      }

      return {
        ...context,
        [data.variableName]: {
          to,
          subject,
          body: body.slice(0, 2000),
        },
      };
    });
    
    await publish(
      gmailChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return result;
  } catch (error) {
     await publish(
      gmailChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
