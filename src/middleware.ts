import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const APP_HOSTS = new Set(["app.domain.eu", "app.localhost"]);
const MARKETING_HOSTS = new Set(["domain.eu", "www.domain.eu"]);

function getHostname(request: NextRequest) {
  const hostHeader = request.headers.get("host") ?? "";
  return hostHeader.split(":")[0].toLowerCase();
}

export function middleware(request: NextRequest) {
  const hostname = getHostname(request);
  const { pathname } = request.nextUrl;

  // Host-based skeleton for future deploy setup:
  // - app.domain.eu / app.localhost should open product dashboard by default.
  // - domain.eu / www.domain.eu should keep marketing homepage on `/`.
  // - localhost stays flexible during development so both marketing `/`
  //   and app routes like `/dashboard` remain directly accessible.
  // Extend here with stricter host + path rewrites once DNS/proxy is configured.
  if (APP_HOSTS.has(hostname) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.rewrite(url);
  }

  if (MARKETING_HOSTS.has(hostname) && pathname === "/dashboard") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sw.js).*)"],
};
