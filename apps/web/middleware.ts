import { NextRequest, NextResponse } from "next/server";
import { DEMO_MODE } from "./lib/demo";

function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Keeps the pitch demo private: HTTP Basic Auth on every page while NEXT_PUBLIC_DEMO_MODE is on. */
export function middleware(request: NextRequest) {
  if (!DEMO_MODE) return NextResponse.next();
  const user = process.env.DEMO_USER || "fixotec";
  const pass = process.env.DEMO_PASS;
  if (!pass) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("Demo access is not configured (set DEMO_PASS).", { status: 503 });
  }
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const idx = decoded.indexOf(":");
      if (idx >= 0 && safeEqual(decoded.slice(0, idx), user) && safeEqual(decoded.slice(idx + 1), pass)) return NextResponse.next();
    } catch {
      // malformed header falls through to the challenge
    }
  }
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Fixotec concept demo", charset="UTF-8"', "X-Robots-Tag": "noindex, nofollow" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|robots.txt).*)"],
};
