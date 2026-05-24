"use client";

import { useSuspenseDashboardStats } from "../hooks/use-dashboard";
import { formatDistanceToNow } from "date-fns";
import { 
  ZapIcon, 
  ActivityIcon, 
  ClockIcon, 
  CheckCircle2Icon, 
  XCircleIcon, 
  Loader2Icon,
  ArrowRightIcon
} from "lucide-react";
import Link from "next/link";
import { ExecutionStatus } from "@/generated/prisma";
import { ErrorBoundary } from "react-error-boundary";
import { Suspense } from "react";
import { ErrorView, LoadingView } from "@/components/entity-components";

const StatCard = ({ 
  title, 
  value, 
  icon: Icon,
  description 
}: { 
  title: string; 
  value: number; 
  icon: React.ElementType;
  description: string;
}) => (
  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 flex flex-col justify-between">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-medium text-zinc-400">{title}</h3>
      <div className="p-2 bg-zinc-800/50 rounded-lg">
        <Icon className="size-4 text-violet-400" />
      </div>
    </div>
    <div>
      <p className="text-3xl font-semibold text-white">{value}</p>
      <p className="text-xs text-zinc-500 mt-1">{description}</p>
    </div>
  </div>
);

const ExecutionStatusIcon = ({ status }: { status: ExecutionStatus }) => {
  switch (status) {
    case "SUCCESS":
      return <CheckCircle2Icon className="size-5 text-emerald-500" />;
    case "FAILED":
      return <XCircleIcon className="size-5 text-red-500" />;
    case "RUNNING":
      return <Loader2Icon className="size-5 text-blue-500 animate-spin" />;
    default:
      return null;
  }
};

const DashboardContent = () => {
  const { data } = useSuspenseDashboardStats();

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto p-6 md:p-10 w-full">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Overview</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Here's a summary of your automated tasks and processes.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard 
          title="Total Automations" 
          value={data.totalAutomations} 
          icon={ZapIcon}
          description="Active workflows in your account"
        />
        <StatCard 
          title="Total Executions" 
          value={data.totalExecutions} 
          icon={ActivityIcon}
          description="Tasks processed so far"
        />
        <StatCard 
          title="Scheduled Tasks" 
          value={data.activeSchedules} 
          icon={ClockIcon}
          description="Automations running on a schedule"
        />
      </div>

      {/* Recent Activity */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800/50">
          <h2 className="text-base font-semibold text-white">Recent Activity</h2>
          <Link 
            href="/executions" 
            className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
          >
            View all <ArrowRightIcon className="size-4" />
          </Link>
        </div>
        
        {data.recentExecutions.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-zinc-500">No activity yet. Run an automation to see it here.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {data.recentExecutions.map((execution) => (
              <div key={execution.id} className="flex items-center justify-between p-4 hover:bg-zinc-800/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center size-10 rounded-full bg-zinc-950 border border-zinc-800">
                    <ExecutionStatusIcon status={execution.status} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      {execution.workflow.name}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
                      <span className="capitalize">{execution.status.toLowerCase()}</span>
                      <span>&bull;</span>
                      <span>{formatDistanceToNow(execution.startedAt, { addSuffix: true })}</span>
                    </p>
                  </div>
                </div>
                <Link 
                  href={`/executions/${execution.id}`}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
                >
                  View Details
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const DashboardOverview = () => {
  return (
    <ErrorBoundary fallback={<ErrorView message="Error loading dashboard stats" />}>
      <Suspense fallback={<LoadingView message="Loading overview..." />}>
        <DashboardContent />
      </Suspense>
    </ErrorBoundary>
  );
};
