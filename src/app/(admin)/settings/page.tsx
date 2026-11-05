import type { Metadata } from "next";
import SettingsPage from "@/views/Settings";

export const metadata: Metadata = {
  title: "Store Settings",
  description:
    "General configuration for store contact info, currency, tax, and order notifications.",
};

export default function Page() {
  return <SettingsPage />;
}
