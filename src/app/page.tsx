import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/components/landing-page";

export const metadata: Metadata = {
  title: "Orcha — AI Workflow Orchestration",
  description:
    "Describe your workflow in plain English. Orcha's AI builds, validates, and deploys it instantly.",
};

const Page = () => {
  return <LandingPage />;
};

export default Page;
