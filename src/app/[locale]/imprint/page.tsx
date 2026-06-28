import { getTranslations, setRequestLocale } from 'next-intl/server';

/**
 * Locale-invariant operator data. TODO(legal): replace with the real registered
 * company name, address, contact and VAT ID before production launch (Decision C
 * — binding Impressum data requires legal sign-off).
 */
const ORG = {
  name: 'DealRadar Europe Ltd.',
  address: ['DealRadar Systems', 'Tech Park Hub, Rue de la Loi 200', '1040 Brussels, Belgium'],
  email: 'contact@dealradar.eu',
  vat: 'BE 0123.456.789',
};
const ODR_URL = 'https://ec.europa.eu/consumers/odr';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'imprint' });
  return { title: `${t('title')} · DealRadar` };
}

export default async function ImprintPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'imprint' });
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-zinc-800">
      <h1 className="mb-6 text-3xl font-bold">{t('title')}</h1>
      <div className="space-y-4 text-sm leading-relaxed">
        <p><strong>{ORG.name}</strong></p>
        <p>{t('infoLine')}</p>
        <p>{ORG.address.map((line) => <span key={line}>{line}<br /></span>)}</p>
        <p><strong>{t('representedByLabel')}:</strong> {t('representedBy')}</p>
        <p><strong>{t('contactLabel')}:</strong> {ORG.email}</p>
        <p><strong>{t('vatLabel')}:</strong> {ORG.vat}</p>
        <hr className="my-6 border-zinc-200" />
        <h2 className="text-lg font-semibold">{t('disputeTitle')}</h2>
        <p>
          {t.rich('disputeBody', {
            link: (chunks) => (
              <a href={ODR_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                {chunks}
              </a>
            ),
          })}
        </p>
      </div>
    </div>
  );
}
