import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { LanguageSwitcher } from './LanguageSwitcher';

export function Footer() {
  const t = useTranslations('footer');
  const locale = useLocale();
  return (
    <footer className="mt-16 border-t border-zinc-100 bg-zinc-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p>© {new Date().getFullYear()} DealRadar · {t('affiliateDisclosure')}</p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs">
            <Link href={`/${locale}/imprint`} className="hover:underline">Imprint</Link>
            <Link href={`/${locale}/privacy`} className="hover:underline">Privacy Policy</Link>
            <Link href={`/${locale}/terms`} className="hover:underline">Terms of Service</Link>
          </div>
        </div>
        <div className="sm:hidden"><LanguageSwitcher /></div>
      </div>
    </footer>
  );
}
