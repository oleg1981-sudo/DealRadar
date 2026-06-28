'use client';

import { useTranslations } from 'next-intl';
import { openCookiePreferences } from './CookieConsent';

/** Footer control that re-opens the cookie preferences modal (GDPR Art. 7(3) withdrawal). */
export function CookieSettingsButton({ className }: { className?: string }) {
  const t = useTranslations('footer');
  return (
    <button type="button" onClick={openCookiePreferences} className={className}>
      {t('cookieSettings')}
    </button>
  );
}
