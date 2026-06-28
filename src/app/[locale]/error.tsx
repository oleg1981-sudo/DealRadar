'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Locale-segment error boundary. Catches render/data failures (e.g. Supabase
 * unavailable) and offers a retry instead of a blank screen. Must be a Client
 * Component per the App Router contract.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('error');

  useEffect(() => {
    console.error('[route-error]', error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="mb-2 text-xl font-semibold text-zinc-900">{t('title')}</h1>
      <p className="mb-6 text-sm text-zinc-500">{t('body')}</p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        {t('retry')}
      </button>
    </div>
  );
}
