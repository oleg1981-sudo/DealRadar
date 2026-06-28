import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'privacy' });
  return { title: `${t('title')} · DealRadar` };
}

export default async function PrivacyPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'privacy' });
  const sections = ['s1', 's2', 's3', 's4', 's5', 's6'] as const;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-zinc-800">
      <h1 className="mb-6 text-3xl font-bold">{t('title')}</h1>
      <div className="space-y-6 text-sm leading-relaxed">
        <p>{t('intro')}</p>
        {sections.map((s) => (
          <section key={s}>
            <h2 className="mb-2 text-xl font-semibold">{t(`${s}Title`)}</h2>
            <p>{t(`${s}Body`)}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
