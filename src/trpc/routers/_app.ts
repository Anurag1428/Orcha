import { workflowsRouter } from "@/features/workflows/server/routers";
import { executionsRouter } from "@/features/executions/server/routers";
import { dashboardRouter } from "@/features/dashboard/server/routers";
import { createTRPCRouter } from "../init";

export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
  executions: executionsRouter,
  dashboard: dashboardRouter,
});
// export type definition of API
export type AppRouter = typeof appRouter;
