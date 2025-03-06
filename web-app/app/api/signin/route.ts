import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import * as crypto from 'crypto';

export const runtime = 'edge';

// Handle OPTIONS requests (for CORS)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// Handle POST requests for login
export async function POST(req: NextRequest) {
  // Add CORS headers
  const headers = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  });

  try {
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    console.log('Environment check - ADMIN_PASSWORD exists:', !!ADMIN_PASSWORD);

    if (!ADMIN_PASSWORD) {
      console.error('ADMIN_PASSWORD is not set in environment variables');
      return new NextResponse(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers,
      });
    }

    const body = await req.json();
    const { password } = body;

    if (!password) {
      return new NextResponse(JSON.stringify({ error: 'Password is required' }), {
        status: 400,
        headers,
      });
    }

    if (password !== ADMIN_PASSWORD) {
      return new NextResponse(JSON.stringify({ error: 'Invalid password' }), {
        status: 401,
        headers,
      });
    }

    // Generate a session token
    const sessionToken = crypto.randomBytes(32).toString('hex');

    const responseHeaders = new Headers(headers);
    // Set the session cookie
    responseHeaders.append('Set-Cookie', `session=${sessionToken}; HttpOnly; Path=/; SameSite=Strict; ${process.env.NODE_ENV === 'production' ? 'Secure;' : ''} Max-Age=${7 * 24 * 60 * 60}`);

    return new NextResponse(JSON.stringify({ success: true }), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Login error FROM ROUTE:', error);
    return new NextResponse(JSON.stringify({ error: 'Server error during login' }), {
      status: 500,
      headers,
    });
  }
}

// Handle GET requests (optional, for API documentation)
export async function GET() {
  return NextResponse.json({ error: 'Please use POST method for login' }, { status: 405 });
}
