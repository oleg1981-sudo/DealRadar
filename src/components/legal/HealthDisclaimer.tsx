'use client';

/**
 * One-time health/medicine interstitial. Shown the first time a visitor enters
 * the Health category (or a Health deal/search); acknowledgement is remembered
 * in localStorage so it never nags. Makes explicit that DealRadar is a
 * price-comparison service — we neither sell nor advise on nor promote the use
 * of any medicine; we link to third-party pharmacies.
 *
 * Not legal advice-bearing UI by itself: the ingest also excludes genuine
 * prescription-only items (isPrescriptionOnly in scripts/ingest-awin.cjs).
 *
 * Mounted server-side only on Health surfaces, so it costs nothing elsewhere.
 * Uses the project portal pattern (created div appended to body) to escape the
 * header's backdrop-blur and avoid the Next dev HMR-while-rendering crash.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';

const ACK_KEY = 'dr-health-disclaimer-ack';

export function HealthDisclaimer() {
  const t = useTranslations('healthDisclaimer');
  const [open, setOpen] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let acknowledged = false;
    try {
      acknowledged = localStorage.getItem(ACK_KEY) === '1';
    } catch {
      // localStorage blocked (private mode / cookies off) — show once per load.
    }
    if (acknowledged) return;

    const el = document.createElement('div');
    el.setAttribute('data-health-disclaimer', '');
    document.body.appendChild(el);
    setPortalEl(el);
    setOpen(true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.removeChild(el);
    };
  }, []);

  function acknowledge() {
    try {
      localStorage.setItem(ACK_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
    document.body.style.overflow = '';
  }

  if (!open || !portalEl) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="health-disclaimer-title">
      <div className="absolute inset-0 bg-zinc-900/50" />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-card-hover">
        <h2 id="health-disclaimer-title" className="text-lg font-semibold text-zinc-900">
          {t('title')}
        </h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-600">{t('body')}</p>
        <button
          type="button"
          onClick={acknowledge}
          className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          {t('acknowledge')}
        </button>
      </div>
    </div>,
    portalEl,
  );
}
