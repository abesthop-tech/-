import { NextRequest, NextResponse } from 'next/server';
import { PASSCODE_COOKIE_NAME, ONE_YEAR_SECONDS, verifyPasscode } from '@/middleware';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const provided = body.passcode;
    const expected = process.env.APP_PASSCODE;

    if (!expected || expected.trim() === '') {
      return NextResponse.json({
        success: true,
        message: '合言葉は設定されていません（オープンアクセス）',
      });
    }

    if (!verifyPasscode(provided, expected)) {
      return NextResponse.json(
        { error: '合言葉が正しくありません' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: '合言葉を確認しました',
    });

    response.cookies.set({
      name: PASSCODE_COOKIE_NAME,
      value: expected,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ONE_YEAR_SECONDS,
      path: '/',
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || '認証エラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const expected = process.env.APP_PASSCODE;
  if (!expected || expected.trim() === '') {
    return NextResponse.json({
      authenticated: true,
      passcodeRequired: false,
    });
  }

  const cookie = request.cookies.get(PASSCODE_COOKIE_NAME)?.value;
  const authenticated = verifyPasscode(cookie, expected);

  return NextResponse.json({
    authenticated,
    passcodeRequired: true,
  });
}

export async function DELETE() {
  const response = NextResponse.json({
    success: true,
    message: 'ログアウトしました',
  });

  response.cookies.set({
    name: PASSCODE_COOKIE_NAME,
    value: '',
    httpOnly: true,
    maxAge: 0,
    path: '/',
  });

  return response;
}
