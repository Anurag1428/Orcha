import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { slackChannel } from "@/inngest/channels/slack";

export const slackExecutor: NodeExecutor = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(
    slackChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const result = await step.run("slack-message", async () => {
      // Dummy implementation
      return context;
    });

    await publish(
      slackChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return result;
  } catch (error) {
    await publish(
      slackChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
