import { useTRPC } from "@/trpc/client";

export const useDashboardStats = () => {
  const trpc = useTRPC();
  return trpc.dashboard.getOverviewStats.useQuery();
};

export const useSuspenseDashboardStats = () => {
  const trpc = useTRPC();
  return trpc.dashboard.getOverviewStats.useSuspenseQuery();
};
