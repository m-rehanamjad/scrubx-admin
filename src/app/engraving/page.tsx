import type { Metadata } from "next";
import EngravingPage from "@/views/Engraving";
import { engravingService } from "@/server/services/engraving.service";
import { requireStaffContext } from "@/server/auth";
import { toEngravingOptionDTO } from "@/lib/dto";
import type { EngravingOption } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Engraving Options",
  description: "Configure name, title, and logo embroidery/engraving pricing and guidelines.",
};

export default async function Page() {
  const admin = await requireStaffContext();

  let initialOptions: EngravingOption[] = [];

  try {
    const options = await engravingService.getEngravingOptions({}, admin);
    initialOptions = options.map(toEngravingOptionDTO);
  } catch (err) {
    console.error("[Engraving Page Error]: Failed to fetch engraving options:", err);
  }

  return <EngravingPage initialOptions={initialOptions} />;
}
