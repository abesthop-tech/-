import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  middleware,
  verifyPasscode,
  PASSCODE_COOKIE_NAME,
  PASSCODE_HEADER_NAME,
  ONE_YEAR_SECONDS,
} from '@/middleware';
import { POST, GET, DELETE } from '@/app/api/auth/verify/route';

describe('Adversarial Security Hardening: Middleware & Auth API', () => {
  const ORIGINAL_ENV_PASSCODE = process.env.APP_PASSCODE;
  const TEST_PASSCODE = 'family_secret_2026';

  beforeEach(() => {
    process.env.APP_PASSCODE = TEST_PASSCODE;
  });

  afterEach(() => {
    process.env.APP_PASSCODE = ORIGINAL_ENV_PASSCODE;
  });

  // ==========================================================================
  // Test Suite 1: Malformed & Tampered Cookies
  // ==========================================================================
  describe('1. Malformed and Tampered Cookies', () => {
    const malformedCookies = [
      { label: 'empty cookie value', cookie: `${PASSCODE_COOKIE_NAME}=` },
      { label: 'whitespace only', cookie: `${PASSCODE_COOKIE_NAME}=   ` },
      { label: 'wrong passcode', cookie: `${PASSCODE_COOKIE_NAME}=wrong_password` },
      { label: 'undefined literal', cookie: `${PASSCODE_COOKIE_NAME}=undefined` },
      { label: 'null literal', cookie: `${PASSCODE_COOKIE_NAME}=null` },
      { label: 'zero literal', cookie: `${PASSCODE_COOKIE_NAME}=0` },
      { label: 'false boolean literal', cookie: `${PASSCODE_COOKIE_NAME}=false` },
      { label: 'json object string', cookie: `${PASSCODE_COOKIE_NAME}={"code":"family_secret_2026"}` },
      { label: 'oversized buffer string', cookie: `${PASSCODE_COOKIE_NAME}=${'A'.repeat(8192)}` },
      { label: 'sql injection payload', cookie: `${PASSCODE_COOKIE_NAME}=' OR '1'='1` },
      { label: 'null byte injection', cookie: `${PASSCODE_COOKIE_NAME}=family_secret_2026%00admin` },
      { label: 'partial match prefix', cookie: `${PASSCODE_COOKIE_NAME}=family_secret` },
      { label: 'case variation', cookie: `${PASSCODE_COOKIE_NAME}=FAMILY_SECRET_2026` },
    ];

    malformedCookies.forEach(({ label, cookie }) => {
      it(`strictly returns 401 for ${label}`, async () => {
        const req = new NextRequest('http://localhost:3000/api/menu', {
          headers: { cookie },
        });
        const res = middleware(req);
        expect(res.status).toBe(401);

        const data = await res.json();
        expect(data.error).toBe('Unauthorized');
      });
    });

    it('accepts valid cookie even when surrounded by other random cookies', () => {
      const complexCookie = `theme=dark; ${PASSCODE_COOKIE_NAME}=${TEST_PASSCODE}; session=xyz789; tracking=off`;
      const req = new NextRequest('http://localhost:3000/api/menu', {
        headers: { cookie: complexCookie },
      });
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it('accepts valid cookie with surrounding whitespace (trimmed)', () => {
      const cookie = `${PASSCODE_COOKIE_NAME}=  ${TEST_PASSCODE}  `;
      const req = new NextRequest('http://localhost:3000/api/menu', {
        headers: { cookie },
      });
      const res = middleware(req);
      expect(res.status).toBe(200);
    });
  });

  // ==========================================================================
  // Test Suite 2: Query String Bypass Attempts
  // ==========================================================================
  describe('2. Query String Bypass Attempts', () => {
    it('strictly returns 401 for incorrect passcode in query string', async () => {
      const req = new NextRequest('http://localhost:3000/api/menu?passcode=wrong_code');
      const res = middleware(req);
      expect(res.status).toBe(401);
    });

    it('strictly returns 401 for empty passcode in query string', async () => {
      const req = new NextRequest('http://localhost:3000/api/menu?passcode=');
      const res = middleware(req);
      expect(res.status).toBe(401);
    });

    it('strictly returns 401 for whitespace passcode in query string', async () => {
      const req = new NextRequest('http://localhost:3000/api/menu?passcode=%20%20%20');
      const res = middleware(req);
      expect(res.status).toBe(401);
    });

    it('strictly returns 401 for case-mismatched query parameter name', async () => {
      const req = new NextRequest(`http://localhost:3000/api/menu?PASSCODE=${TEST_PASSCODE}`);
      const res = middleware(req);
      expect(res.status).toBe(401);
    });

    it('strictly returns 401 for parameter pollution where first value is wrong', async () => {
      const req = new NextRequest(`http://localhost:3000/api/menu?passcode=wrong&passcode=${TEST_PASSCODE}`);
      const res = middleware(req);
      expect(res.status).toBe(401);
    });

    it('cleans URL and redirects to clean URL with 1-year HttpOnly cookie on valid query param', () => {
      const req = new NextRequest(`http://localhost:3000/api/menu?passcode=${TEST_PASSCODE}&servings=4`);
      const res = middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/api/menu?servings=4');

      const cookie = res.cookies.get(PASSCODE_COOKIE_NAME);
      expect(cookie).toBeDefined();
      expect(cookie?.value).toBe(TEST_PASSCODE);
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.maxAge).toBe(ONE_YEAR_SECONDS);
    });
  });

  // ==========================================================================
  // Test Suite 3: Header Tampering & Authorization Header Variations
  // ==========================================================================
  describe('3. Header Tampering & Authorization Variations', () => {
    it('strictly returns 401 for wrong x-app-passcode header', async () => {
      const req = new NextRequest('http://localhost:3000/api/menu', {
        headers: { [PASSCODE_HEADER_NAME]: 'invalid_token' },
      });
      const res = middleware(req);
      expect(res.status).toBe(401);
    });

    it('strictly returns 401 for empty x-app-passcode header', async () => {
      const req = new NextRequest('http://localhost:3000/api/menu', {
        headers: { [PASSCODE_HEADER_NAME]: '' },
      });
      const res = middleware(req);
      expect(res.status).toBe(401);
    });

    it('strictly returns 401 for wrong Authorization Bearer header', async () => {
      const req = new NextRequest('http://localhost:3000/api/menu', {
        headers: { authorization: 'Bearer wrong_token' },
      });
      const res = middleware(req);
      expect(res.status).toBe(401);
    });

    it('strictly returns 401 for empty Authorization Bearer token', async () => {
      const req = new NextRequest('http://localhost:3000/api/menu', {
        headers: { authorization: 'Bearer ' },
      });
      const res = middleware(req);
      expect(res.status).toBe(401);
    });

    it('strictly returns 401 for Basic auth scheme instead of Bearer', async () => {
      const req = new NextRequest('http://localhost:3000/api/menu', {
        headers: { authorization: `Basic ${TEST_PASSCODE}` },
      });
      const res = middleware(req);
      expect(res.status).toBe(401);
    });

    it('accepts case-insensitive Bearer prefix in Authorization header', () => {
      const req = new NextRequest('http://localhost:3000/api/menu', {
        headers: { authorization: `bearer ${TEST_PASSCODE}` },
      });
      const res = middleware(req);
      expect(res.status).toBe(200);

      const cookie = res.cookies.get(PASSCODE_COOKIE_NAME);
      expect(cookie?.value).toBe(TEST_PASSCODE);
      expect(cookie?.httpOnly).toBe(true);
    });

    it('accepts valid x-app-passcode with whitespace and sets 1-year cookie', () => {
      const req = new NextRequest('http://localhost:3000/api/menu', {
        headers: { [PASSCODE_HEADER_NAME]: `  ${TEST_PASSCODE}  ` },
      });
      const res = middleware(req);
      expect(res.status).toBe(200);

      const cookie = res.cookies.get(PASSCODE_COOKIE_NAME);
      expect(cookie?.value).toBe(TEST_PASSCODE);
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.maxAge).toBe(ONE_YEAR_SECONDS);
    });
  });

  // ==========================================================================
  // Test Suite 4: Static File Regex Bypass & Path Traversal Probing
  // ==========================================================================
  describe('4. Static File Regex Bypass & Route Traversal Probing', () => {
    it('PROBE: Does unauthenticated /api (without trailing slash) return 401?', async () => {
      const req = new NextRequest('http://localhost:3000/api');
      const res = middleware(req);
      // If pathname is '/api', pathname.startsWith('/api/') is FALSE.
      // An unauthenticated request to /api should be rejected with 401.
      expect(res.status).toBe(401);
    });

    it('PROBE: Does uppercase /API/menu return 401 or bypass?', async () => {
      const req = new NextRequest('http://localhost:3000/API/menu');
      const res = middleware(req);
      // If pathname is '/API/menu', pathname.startsWith('/api/') is FALSE.
      expect(res.status).toBe(401);
    });

    it('PROBE: Does appending .js to API endpoint bypass authentication?', async () => {
      const req = new NextRequest('http://localhost:3000/api/menu.js');
      const res = middleware(req);
      // An API request pretending to be a .js static file must NOT bypass 401!
      expect(res.status).toBe(401);
    });

    it('PROBE: Does appending .txt or .png to an API route bypass authentication?', async () => {
      const req = new NextRequest('http://localhost:3000/api/recipes/secret.png');
      const res = middleware(req);
      // An API request pretending to be a .png static file must NOT bypass 401!
      expect(res.status).toBe(401);
    });

    it('PROBE: Does a hypothetical unauthenticated endpoint starting with /api/auth (e.g. /api/authors) bypass authentication?', async () => {
      const req = new NextRequest('http://localhost:3000/api/authors');
      const res = middleware(req);
      // Line 48: pathname.startsWith('/api/auth') matches /api/authors!
      // This should be 401 because /api/authors is not /api/auth/verify!
      expect(res.status).toBe(401);
    });

    it('PROBE: Does a path with dot segments like /api/../api/menu return 401?', async () => {
      const req = new NextRequest('http://localhost:3000/api/../api/menu');
      const res = middleware(req);
      expect(res.status).toBe(401);
    });

    it('legitimate Next.js static asset paths are allowed through without credentials', () => {
      const staticReqs = [
        'http://localhost:3000/_next/static/chunks/app.js',
        'http://localhost:3000/favicon.ico',
        'http://localhost:3000/images/logo.png',
        'http://localhost:3000/site.webmanifest',
      ];
      for (const url of staticReqs) {
        const req = new NextRequest(url);
        const res = middleware(req);
        expect(res.status).toBe(200);
      }
    });
  });

  // ==========================================================================
  // Test Suite 5: Unset / Blank APP_PASSCODE Graceful Passthrough
  // ==========================================================================
  describe('5. Unset & Blank APP_PASSCODE Behavior', () => {
    it('gracefully permits requests when APP_PASSCODE is undefined', () => {
      delete process.env.APP_PASSCODE;
      const req = new NextRequest('http://localhost:3000/api/menu');
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it('gracefully permits requests when APP_PASSCODE is empty string', () => {
      process.env.APP_PASSCODE = '';
      const req = new NextRequest('http://localhost:3000/api/menu');
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it('gracefully permits requests when APP_PASSCODE is only spaces', () => {
      process.env.APP_PASSCODE = '    ';
      const req = new NextRequest('http://localhost:3000/api/menu');
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it('strictly enforces passcode when APP_PASSCODE is string "0"', async () => {
      process.env.APP_PASSCODE = '0';
      // Without credentials -> 401
      const reqUnauth = new NextRequest('http://localhost:3000/api/menu');
      const resUnauth = middleware(reqUnauth);
      expect(resUnauth.status).toBe(401);

      // With wrong passcode -> 401
      const reqWrong = new NextRequest('http://localhost:3000/api/menu', {
        headers: { cookie: `${PASSCODE_COOKIE_NAME}=1` },
      });
      const resWrong = middleware(reqWrong);
      expect(resWrong.status).toBe(401);

      // With exact "0" -> 200
      const reqAuth = new NextRequest('http://localhost:3000/api/menu', {
        headers: { cookie: `${PASSCODE_COOKIE_NAME}=0` },
      });
      const resAuth = middleware(reqAuth);
      expect(resAuth.status).toBe(200);
    });
  });

  // ==========================================================================
  // Test Suite 6: Auth API Route Handlers (/api/auth/verify)
  // ==========================================================================
  describe('6. /api/auth/verify Route Handler Adversarial Stress Tests', () => {
    it('POST returns 401 for wrong passcode string', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode: 'incorrect_passcode' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('正しくありません');
    });

    it('POST returns 401 when passcode field is missing in body', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('POST returns 200 and sets 1-year HttpOnly cookie for correct passcode', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode: TEST_PASSCODE }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);

      const cookie = res.cookies.get(PASSCODE_COOKIE_NAME);
      expect(cookie).toBeDefined();
      expect(cookie?.value).toBe(TEST_PASSCODE);
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe('lax');
      expect(cookie?.maxAge).toBe(ONE_YEAR_SECONDS);
      expect(cookie?.path).toBe('/');
    });

    it('POST accepts correct passcode with leading and trailing spaces', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode: `  ${TEST_PASSCODE}  ` }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('POST handles malformed JSON string without crashing', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ malformed json',
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('STRESS: POST with non-string passcode types (number, boolean, null, object, array)', async () => {
      const nonStringPayloads = [
        { passcode: 123456 },
        { passcode: true },
        { passcode: false },
        { passcode: null },
        { passcode: ['array_value'] },
        { passcode: { nested: 'object' } },
      ];

      for (const payload of nonStringPayloads) {
        const req = new NextRequest('http://localhost:3000/api/auth/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const res = await POST(req);
        // It must NOT crash with 500 (TypeError: provided.trim is not a function).
        // It should reject with 401 Unauthorized or 400 Bad Request!
        expect(res.status).toBe(401);
      }
    });

    it('STRESS: POST with raw "null" JSON body', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'null',
      });
      const res = await POST(req);
      // It must NOT crash with 500 (TypeError: Cannot read properties of null).
      // It should reject cleanly with 401 or 400.
      expect(res.status).toBe(401);
    });

    it('GET returns authenticated: false and passcodeRequired: true when no cookie provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/verify');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(false);
      expect(json.passcodeRequired).toBe(true);
    });

    it('GET returns authenticated: true when valid cookie is provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/verify', {
        headers: { cookie: `${PASSCODE_COOKIE_NAME}=${TEST_PASSCODE}` },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.passcodeRequired).toBe(true);
    });

    it('GET returns authenticated: true and passcodeRequired: false when APP_PASSCODE unset', async () => {
      delete process.env.APP_PASSCODE;
      const req = new NextRequest('http://localhost:3000/api/auth/verify');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.passcodeRequired).toBe(false);
    });

    it('DELETE clears the passcode cookie with maxAge=0', async () => {
      const res = await DELETE();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const cookie = res.cookies.get(PASSCODE_COOKIE_NAME);
      expect(cookie).toBeDefined();
      expect(cookie?.value).toBe('');
      expect(cookie?.maxAge).toBe(0);
    });
  });
});
