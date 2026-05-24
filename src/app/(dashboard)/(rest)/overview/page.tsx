import { DashboardOverview } from "@/features/dashboard/components/dashboard-overview";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient, trpc } from "@/trpc/server";

const Page = async () => {
  await requireAuth();
  
  void trpc.dashboard.getOverviewStats.prefetch();

  return (
    <HydrateClient>
      <div className="flex flex-col h-full overflow-y-auto">
        <DashboardOverview />
      </div>
    </HydrateClient>
  );
};

export default Page;
