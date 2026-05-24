import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

export const dashboardRouter = createTRPCRouter({
  getOverviewStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.auth.user.id;

    // Run queries in parallel
    const [
      totalAutomations,
      totalExecutions,
      activeSchedules,
      recentExecutions,
    ] = await Promise.all([
      // Total workflows
      prisma.workflow.count({
        where: { userId },
      }),
      
      // Total executions
      prisma.execution.count({
        where: { workflow: { userId } },
      }),

      // Active schedules
      prisma.scheduledWorkflow.count({
        where: { 
          workflow: { userId },
          isActive: true,
        },
      }),

      // Recent 5 executions
      prisma.execution.findMany({
        where: { workflow: { userId } },
        orderBy: { startedAt: "desc" },
        take: 5,
        include: {
          workflow: {
            select: { name: true },
          },
        },
      }),
    ]);

    return {
      totalAutomations,
      totalExecutions,
      activeSchedules,
      recentExecutions,
    };
  }),
});
