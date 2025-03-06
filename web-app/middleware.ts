import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // const session = request.cookies.get('session');
  // const isLoginPage = request.nextUrl.pathname === '/login';

  // // If trying to access login page with valid session, redirect to dashboard
  // if (isLoginPage && session) {
  //   return NextResponse.redirect(new URL('/', request.url));
  // }

  // // If trying to access protected route without session, redirect to login
  // if (!session && !isLoginPage) {
  //   return NextResponse.redirect(new URL('/login', request.url));
  // }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - login page (already handled in middleware)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|login).*)',
  ],
};
