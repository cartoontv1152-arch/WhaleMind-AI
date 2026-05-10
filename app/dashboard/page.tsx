import type { Metadata } from "next";

import { DashboardClient } from "@/components/dashboard/dashboard-client";

export const metadata: Metadata = {
  title: "WhaleMind Dashboard - Live Trading Intelligence",
  description: "Wallet-gated WhaleMind dashboard for SoSoValue, SoDEX, and ValueChain intelligence.",
};

export default function DashboardPage() {
  return <DashboardClient />;
}
