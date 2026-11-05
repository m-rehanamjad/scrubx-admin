import type { Metadata } from "next";
import NotFoundPage from "@/views/NotFound";

export const metadata: Metadata = {
  title: "Not Found",
  description: "The requested page could not be found.",
};

export default function NotFound() {
  return <NotFoundPage />;
}
