import { channel, topic } from "@inngest/realtime";

export const FOR_EACH_STARTUP_CHANNEL_NAME = "for-each-startup-execution";

export const forEachStartupChannel = channel(
  FOR_EACH_STARTUP_CHANNEL_NAME,
).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
    processed?: number;
    total?: number;
  }>(),
);
