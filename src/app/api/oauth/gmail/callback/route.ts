import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import prisma from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { CredentialType } from "@/generated/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const userId = searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // 1. Validate params
  if (!code || !userId) {
    return NextResponse.redirect(
      new URL("/credentials?error=missing_params", appUrl),
    );
  }

  try {
    // 2. Exchange code for tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/credentials?error=no_refresh_token", appUrl),
      );
    }

    // 3. Get user's email address from Google
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) {
      return NextResponse.redirect(
        new URL("/credentials?error=no_email", appUrl),
      );
    }

    // 4. Store encrypted credential in DB
    const credentialPayload = JSON.stringify({
      refresh_token: tokens.refresh_token,
      email,
    });

    await prisma.credential.create({
      data: {
        name: `Gmail — ${email}`,
        type: CredentialType.GMAIL,
        value: encrypt(credentialPayload),
        userId,
      },
    });

    // 5. Redirect back to credentials page
    return NextResponse.redirect(
      new URL("/credentials?success=gmail_connected", appUrl),
    );
  } catch (error) {
    console.error("Gmail OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/credentials?error=oauth_failed", appUrl),
    );
  }
}
