import { trpc } from "@/trpc/client";

export const useDashboardStats = () => {
  return trpc.dashboard.getOverviewStats.useQuery();
};

export const useSuspenseDashboardStats = () => {
  return trpc.dashboard.getOverviewStats.useSuspenseQuery();
};
