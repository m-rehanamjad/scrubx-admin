import type { Metadata } from "next";
import EngravingPage from "@/views/Engraving";

export const metadata: Metadata = {
  title: "Engraving Options",
  description:
    "Configure name, title, and logo embroidery/engraving pricing and guidelines.",
};

export default function Page() {
  return <EngravingPage />;
}
