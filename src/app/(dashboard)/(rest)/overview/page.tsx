import { DashboardOverview } from "@/features/dashboard/components/dashboard-overview";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient, trpc, prefetch } from "@/trpc/server";

const Page = async () => {
  await requireAuth();
  
  prefetch(trpc.dashboard.getOverviewStats.queryOptions());

  return (
    <HydrateClient>
      <div className="flex flex-col h-full overflow-y-auto">
        <DashboardOverview />
      </div>
    </HydrateClient>
  );
};

export default Page;
