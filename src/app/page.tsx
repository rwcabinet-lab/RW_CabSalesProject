import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadUserAccessProfile } from "@/lib/access-control";
import { getRoleLandingPath, type AppRole } from "@/lib/page-access";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const cookieStore = cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(rawToken);
  if (!session?.userId) {
    redirect("/login");
  }

  const profile = await loadUserAccessProfile(session.userId);
  if (!profile || profile.email.startsWith("preview-")) {
    redirect("/login");
  }

  const targetPath = getRoleLandingPath(profile.role as AppRole, profile.pages);
  redirect(targetPath);
}
