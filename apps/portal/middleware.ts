import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "fx_session";

/** Sends signed-out visitors to /login; the API still validates the session on every call. */
export function middleware(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const login = new URL("/login", request.url);
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|api/|_next/|favicon|robots.txt|.*\\.(?:svg|png|jpg|jpeg|webp|ico|css|js|woff2?)$).*)"],
};
