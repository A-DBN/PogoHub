import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { notFound } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import '../globals.css';
import { getDictionary, isLocale, LOCALES } from '@/i18n';
import { I18nProvider } from '@/i18n/client';
import { getCurrentUser } from '@/server/auth/session';
import { logoutAction } from '@/server/auth/actions';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

const appFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-app',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PoGO PvP Hub',
  description: 'Compagnon PvP & PvE pour Pokémon GO : méta, équipes, raids, shiny dex.',
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dict = getDictionary(locale);
  const user = await getCurrentUser();

  return (
    <html lang={locale} className={`${appFont.variable} h-full antialiased`}>
      <body className="min-h-full">
        <I18nProvider locale={locale} dict={dict}>
          <div className="flex min-h-dvh">
            <Sidebar role={user?.role ?? 'GUEST'} />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar user={user} logout={logoutAction} />
              <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 md:px-6">
                {children}
              </main>
              <footer className="px-6 pb-6 pt-10 text-center text-xs text-muted/70">
                Données : PvPoke (MIT) · PokeMiners · LeekDuck · pogoapi — projet non officiel,
                sans lien avec Niantic ni The Pokémon Company.
              </footer>
            </div>
          </div>
        </I18nProvider>

        {/* Mesures Vercel : en fin de body pour ne rien retarder au rendu.
            Hors production elles ne s'activent pas d'elles-mêmes. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
