import { isAdmin } from "@/lib/roles";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/layout/app-shell";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (
    (!process.env.DATABASE_URL && !process.env.SUPABASE_DATABASE_URL) ||
    !process.env.BETTER_AUTH_URL ||
    !process.env.BETTER_AUTH_SECRET
  )
    return (
      <main className="p-10">
        <h1>Application setup required</h1>
        <p>
          Configure .env.local using .env.example and apply the migrations. See
          README.md.
        </p>
      </main>
    );
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session.user)) redirect("/login?error=forbidden");
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
