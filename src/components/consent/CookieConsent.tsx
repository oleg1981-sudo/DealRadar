'use client';

/**
 * GDPR cookie consent via the FOSS library vanilla-cookieconsent (Orest Bida,
 * MIT) — satisfies FR-COMP-6 / NFR-TECH-7 (FOSS-preferred). Categories:
 *   - necessary: always on, read-only (language + location)
 *   - analytics: opt-in, default OFF (no non-essential cookie before consent)
 * Accept / Reject are equal-weight (EDPB dark-pattern compliance). Re-openable
 * via the footer "Cookie settings" control (see CookieSettingsButton).
 */
import { useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import * as CookieConsent from 'vanilla-cookieconsent';
import 'vanilla-cookieconsent/dist/cookieconsent.css';

export function CookieConsentProvider() {
  const t = useTranslations('consent');
  const locale = useLocale();

  useEffect(() => {
    CookieConsent.run({
      guiOptions: {
        consentModal: { layout: 'box', position: 'bottom right', equalWeightButtons: true, flipButtons: false },
        preferencesModal: { layout: 'box', equalWeightButtons: true, flipButtons: false },
      },
      categories: {
        necessary: { enabled: true, readOnly: true },
        analytics: { enabled: false },
      },
      language: {
        default: locale,
        translations: {
          [locale]: {
            consentModal: {
              title: t('title'),
              description: t('description'),
              acceptAllBtn: t('acceptAll'),
              acceptNecessaryBtn: t('rejectAll'),
              showPreferencesBtn: t('manage'),
            },
            preferencesModal: {
              title: t('prefTitle'),
              acceptAllBtn: t('acceptAll'),
              acceptNecessaryBtn: t('rejectAll'),
              savePreferencesBtn: t('save'),
              closeIconLabel: t('closeLabel'),
              sections: [
                { description: t('prefDescription') },
                { title: t('necessaryTitle'), description: t('necessaryDescription'), linkedCategory: 'necessary' },
                { title: t('analyticsTitle'), description: t('analyticsDescription'), linkedCategory: 'analytics' },
              ],
            },
          },
        },
      },
    });
  }, [locale, t]);

  return null;
}

/** Re-open the consent preferences modal (used by the footer Cookie settings link). */
export function openCookiePreferences() {
  CookieConsent.showPreferences();
}
