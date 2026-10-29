import { NextResponse, type NextRequest } from 'next/server';

/**
 * Password for the whole dashboard, including the /api requests it forwards.
 *
 * Set DASHBOARD_PASSWORD in dashboard/.env.local. The browser asks once and
 * remembers it. Any username works; only the password is checked. Without a
 * password set, the dashboard stays open (and says so in the server log).
 */
const PASSWORD = process.env.DASHBOARD_PASSWORD || '';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(request: NextRequest) {
  if (!PASSWORD) return NextResponse.next();

  const header = request.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const password = decoded.slice(decoded.indexOf(':') + 1);
      if (safeEqual(password, PASSWORD)) return NextResponse.next();
    } catch {
      // malformed header: fall through to the prompt
    }
  }

  return new NextResponse('Password required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Print Prep", charset="UTF-8"' }
  });
}

export const config = {
  // Everything except Next's own static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
