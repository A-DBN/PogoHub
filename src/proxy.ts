import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, isLocale } from '@/i18n/config';

/**
 * Next 16 : `middleware` a été renommé `proxy` (runtime Node.js).
 * Rôle ici : garantir un segment de langue dans l'URL et retenir le choix.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasLocale = LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) return NextResponse.next();

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const headerLocale = request.headers
    .get('accept-language')
    ?.split(',')[0]
    ?.split('-')[0];

  const locale = isLocale(cookieLocale)
    ? cookieLocale
    : isLocale(headerLocale)
      ? headerLocale
      : DEFAULT_LOCALE;

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  const response = NextResponse.redirect(url);
  response.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  return response;
}

export const config = {
  // '/' doit être listé explicitement : le motif générique ne l'attrape pas.
  matcher: ['/', '/((?!api|_next|.*\\..*).*)'],
};
