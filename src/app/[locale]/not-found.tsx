import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

/**
 * Locale-segment 404 boundary. Co-located here (not just the root not-found.tsx)
 * so notFound() thrown by dynamic routes — e.g. an unknown deal slug — renders
 * inside the locale chrome AND returns a real HTTP 404 (R-RTE-1). The root
 * not-found rendered the wrong status for nested dynamic routes.
 */
export default async function LocaleNotFound() {
  const locale = await getLocale();
  let title = 'Page not found';
  let body = "The page you're looking for doesn't exist or has moved.";
  let backHome = 'Back to deals';
  try {
    const t = await getTranslations('notFound');
    title = t('title');
    body = t('body');
    backHome = t('backHome');
  } catch {
    /* fall back to English if locale context is unavailable */
  }
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="mb-2 text-5xl font-bold text-zinc-900">404</p>
      <h1 className="mb-2 text-xl font-semibold text-zinc-900">{title}</h1>
      <p className="mb-6 text-sm text-zinc-500">{body}</p>
      <Link
        href={`/${locale}`}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        {backHome}
      </Link>
    </div>
  );
}
