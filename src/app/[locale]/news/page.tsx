import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getNews } from '@/server/queries/news';
import { NewsFeed } from '@/components/news/NewsFeed';
import { PageHeader } from '@/components/ui';

export default async function NewsPage({ params }: PageProps<'/[locale]/news'>) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);
  const feed = await getNews(locale);

  return (
    <div>
      <PageHeader title={dict.news.title} subtitle={dict.news.subtitle} />
      <NewsFeed feed={feed} locale={locale} />
    </div>
  );
}
