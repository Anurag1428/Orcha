"use client";

import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { BaseExecutionNode } from "../base-execution-node";

type SlackNodeType = Node<{}>;

export const SlackNode = memo((props: NodeProps<SlackNodeType>) => {
  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon="/logos/slack.svg"
      name="Slack"
      status="initial"
      description="Not implemented"
    />
  )
});

SlackNode.displayName = "SlackNode";
