"use client";

import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { BaseExecutionNode } from "../base-execution-node";

type DiscordNodeType = Node<{}>;

export const DiscordNode = memo((props: NodeProps<DiscordNodeType>) => {
  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon="/logos/discord.svg"
      name="Discord"
      status="initial"
      description="Not implemented"
    />
  )
});

DiscordNode.displayName = "DiscordNode";
