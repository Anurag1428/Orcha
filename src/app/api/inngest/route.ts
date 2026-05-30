import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { executeWorkflow } from "@/inngest/functions";
import { executeStartupOutreach } from "@/inngest/startup-outreach";

// Create an API that serves zero functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [executeWorkflow, executeStartupOutreach],
});
