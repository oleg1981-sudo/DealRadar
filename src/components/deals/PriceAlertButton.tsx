'use client';

/**
 * Per-card price-drop alert: a small button that reveals an inline email field.
 * Submitting POSTs to /api/alerts; the refresh job emails the user when the
 * product's price later drops below the price at subscribe time.
 */
import { useId, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BellRing, Check, Loader2 } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PriceAlertButton({
  productId,
  productName,
  price,
  currency,
}: {
  productId: string;
  productName: string;
  price: number;
  currency: string;
}) {
  const t = useTranslations('alert');
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError(t('invalidEmail'));
      setStatus('error');
      return;
    }
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), productId, productName, price, currency }),
      });
      if (!res.ok) throw new Error('request failed');
      setStatus('success');
    } catch {
      setError(t('errorGeneric'));
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <p className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-green-50 px-2 py-2 text-center text-xs font-medium text-green-700">
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {t('success')}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40 text-xs font-medium text-accent transition-colors hover:border-accent hover:bg-accent-soft"
      >
        <BellRing className="h-3.5 w-3.5 origin-top group-hover:animate-bell-alert" aria-hidden />
        {t('button')}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2">
      <label htmlFor={`alert-${uid}`} className="sr-only">
        {t('button')}
      </label>
      <div className="flex gap-1.5">
        <input
          id={`alert-${uid}`}
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === 'error') setStatus('idle');
          }}
          placeholder={t('emailPlaceholder')}
          // 16px text-base keeps iOS Safari from zooming the page on focus.
          className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 text-base placeholder:text-zinc-400 focus-visible:border-accent focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-accent px-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {status === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : t('submit')}
        </button>
      </div>
      {status === 'error' && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </form>
  );
}
