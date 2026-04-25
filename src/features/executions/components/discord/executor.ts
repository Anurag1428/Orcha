import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { discordChannel } from "@/inngest/channels/discord";

export const discordExecutor: NodeExecutor = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(
    discordChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const result = await step.run("discord-message", async () => {
      // Dummy implementation
      return context;
    });

    await publish(
      discordChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return result;
  } catch (error) {
    await publish(
      discordChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
