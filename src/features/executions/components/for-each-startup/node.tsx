"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { ListTreeIcon } from "lucide-react";
import { memo, useState } from "react";
import { FOR_EACH_STARTUP_CHANNEL_NAME } from "@/inngest/channels/for-each-startup";
import { useNodeStatus } from "../../hooks/use-node-status";
import { BaseExecutionNode } from "../base-execution-node";
import { fetchForEachStartupRealtimeToken } from "./actions";
import { ForEachStartupDialog, type ForEachStartupFormValues } from "./dialog";

type ForEachStartupNodeData = {
  variableName?: string;
  startupsPath?: string;
  startupsJson?: string;
  sourceUrl?: string;
  postText?: string;
  imageUrl?: string;
  openaiCredentialId?: string;
  gmailCredentialId?: string;
  senderName?: string;
  senderContext?: string;
  testEmail?: string;
  liveMode?: boolean;
};

type ForEachStartupNodeType = Node<ForEachStartupNodeData>;

export const ForEachStartupNode = memo(
  (props: NodeProps<ForEachStartupNodeType>) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { setNodes } = useReactFlow();

    const nodeStatus = useNodeStatus({
      nodeId: props.id,
      channel: FOR_EACH_STARTUP_CHANNEL_NAME,
      topic: "status",
      refreshToken: fetchForEachStartupRealtimeToken,
    });

    const handleOpenSettings = () => setDialogOpen(true);

    const handleSubmit = (values: ForEachStartupFormValues) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== props.id) return node;

          return {
            ...node,
            data: {
              ...node.data,
              ...values,
            },
          };
        }),
      );
    };

    const nodeData = props.data;
    const description = nodeData?.startupsJson
      ? "Startup JSON override"
      : nodeData?.startupsPath
        ? `Array: ${nodeData.startupsPath}`
        : "Not configured";

    return (
      <>
        <ForEachStartupDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleSubmit}
          defaultValues={nodeData}
        />
        <BaseExecutionNode
          {...props}
          id={props.id}
          icon={ListTreeIcon}
          name="For Each Startup"
          status={nodeStatus}
          description={description}
          onSettings={handleOpenSettings}
          onDoubleClick={handleOpenSettings}
        />
      </>
    );
  },
);

ForEachStartupNode.displayName = "ForEachStartupNode";
