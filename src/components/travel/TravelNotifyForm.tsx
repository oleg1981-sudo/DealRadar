'use client';

/**
 * "Get notified" capture for the TravelDeal coming-soon pages.
 *
 * Mirrors PriceAlertButton's states (idle → loading → success/error) so the two
 * email forms on the site behave identically. Success replaces the form rather
 * than sitting above it — there is nothing left to do, and leaving an armed
 * input invites a confused second submit.
 */
import { useId, useState, type FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { BellRing, Check, Loader2 } from 'lucide-react';

export function TravelNotifyForm({ sourceSlug }: { sourceSlug: string }) {
  const t = useTranslations('travelDeal');
  const locale = useLocale();
  const id = useId();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch('/api/travel-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, locale, sourceSlug }),
      });
      setStatus(res.ok ? 'success' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <p className="mx-auto mt-8 inline-flex max-w-md items-center justify-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        {t('notifySuccess')}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-8 w-full max-w-md">
      <label htmlFor={id} className="sr-only">
        {t('emailLabel')}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === 'error') setStatus('idle');
          }}
          placeholder={t('emailPlaceholder')}
          // text-base, not smaller: iOS Safari zooms the whole page when a
          // focused input is under 16px.
          className="h-11 min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 text-base placeholder:text-zinc-400 focus-visible:border-blue-600 focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          // Same classes as the site's primary CTA (the "go to shop" button on
          // deal cards), so this reads as one button system rather than a
          // one-off.
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <BellRing className="h-4 w-4" aria-hidden />
          )}
          {t('getNotified')}
        </button>
      </div>

      {status === 'error' && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {t('notifyError')}
        </p>
      )}

      <p className="mt-2 text-xs text-zinc-500">{t('notifyPrivacy')}</p>
    </form>
  );
}
