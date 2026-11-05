import type { Metadata } from "next";
import Dashboard from "@/views/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Live performance across orders, revenue and inventory for ScrubX Pakistan.",
};

export default function Page() {
  return <Dashboard />;
}
