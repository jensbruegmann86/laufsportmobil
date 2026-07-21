import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const legacyTeacherLinkMatch = pathname.match(/^\/dashboard\/runs\/([^/]+)\/students$/);

  if (legacyTeacherLinkMatch && request.nextUrl.searchParams.has("access")) {
    const runId = legacyTeacherLinkMatch[1];
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/teacher/runs/${runId}/students`;

    return NextResponse.redirect(redirectUrl);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
