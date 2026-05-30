"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { forEachStartupChannel } from "@/inngest/channels/for-each-startup";
import { inngest } from "@/inngest/client";

export type ForEachStartupToken = Realtime.Token<
  typeof forEachStartupChannel,
  ["status"]
>;

export async function fetchForEachStartupRealtimeToken(): Promise<ForEachStartupToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: forEachStartupChannel(),
    topics: ["status"],
  });

  return token;
}
