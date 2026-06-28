import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { LanguageSwitcher } from './LanguageSwitcher';
import { CookieSettingsButton } from '@/components/consent/CookieSettingsButton';

export function Footer() {
  const t = useTranslations('footer');
  const locale = useLocale();
  const linkCls = 'hover:underline';
  return (
    <footer className="mt-16 border-t border-zinc-100 bg-zinc-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p>© {new Date().getFullYear()} DealRadar · {t('affiliateDisclosure')}</p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs">
            <Link href={`/${locale}/imprint`} className={linkCls}>{t('imprint')}</Link>
            <Link href={`/${locale}/privacy`} className={linkCls}>{t('privacy')}</Link>
            <Link href={`/${locale}/terms`} className={linkCls}>{t('terms')}</Link>
            <CookieSettingsButton className={linkCls} />
          </div>
        </div>
        <div className="sm:hidden"><LanguageSwitcher /></div>
      </div>
    </footer>
  );
}
