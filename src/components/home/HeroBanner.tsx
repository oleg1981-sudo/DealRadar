import { getTranslations } from 'next-intl/server';
import { Search, ShieldCheck } from 'lucide-react';

/**
 * Home hero: headline + value prop, a prominent search (native GET form → the
 * results page, works without JS) and a trust disclosure, with a decorative
 * illustration. Full-bleed warm-peach band; sits between the header and the
 * category bar. Server component.
 */
export async function HeroBanner({ locale }: { locale: string }) {
  const t = await getTranslations();

  return (
    <section className="border-b border-orange-100/70 bg-gradient-to-br from-[#FFF7F1] via-[#FFF0E6] to-[#FFE6D5]">
      <div className="mx-auto grid max-w-7xl items-center gap-6 px-4 py-10 md:grid-cols-[1.2fr_1fr] md:py-14">
        <div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-4xl">
            {t.rich('home.heroTitle', {
              em: (chunks) => <span className="text-accent">{chunks}</span>,
            })}
          </h1>
          <p className="mt-3 max-w-md text-sm text-zinc-600 sm:text-base">{t('home.heroSubtitle')}</p>

          <form action={`/${locale}/search`} method="get" className="mt-5 flex max-w-xl gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                aria-hidden
              />
              <input
                name="q"
                type="search"
                required
                aria-label={t('search.placeholder')}
                placeholder={t('search.placeholder')}
                className="h-12 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-base placeholder:text-zinc-400 shadow-sm focus:border-accent focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {t('home.heroCta')}
            </button>
          </form>

          <p className="mt-3 flex items-start gap-1.5 text-xs text-zinc-500">
            <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span>{t('home.heroDisclosure')}</span>
          </p>
        </div>

        <div className="hidden justify-center md:flex">
          <HeroIllustration />
        </div>
      </div>
    </section>
  );
}

/** Decorative shopping-bag + discount-tag illustration (inline, theme-matched). */
function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 420 320"
      className="h-auto w-full max-w-sm"
      role="img"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="hero-bag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F9CBA7" />
          <stop offset="100%" stopColor="#F2AC7B" />
        </linearGradient>
        <linearGradient id="hero-tag" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#EA580C" />
          <stop offset="100%" stopColor="#C2410C" />
        </linearGradient>
      </defs>

      {/* decorative leaves */}
      <g fill="#FBDCC6">
        <path d="M300 64 C322 26 384 36 392 66 C362 90 318 92 300 64 Z" />
        <path d="M334 116 C357 82 410 92 416 120 C389 144 350 146 334 116 Z" />
        <path d="M288 150 C303 120 348 122 356 146 C333 170 302 172 288 150 Z" />
      </g>
      <path d="M300 252 C300 178 322 120 364 78" fill="none" stroke="#F6C9A6" strokeWidth="4" strokeLinecap="round" />

      {/* shopping bag */}
      <path
        d="M152 122 L300 122 L286 286 a14 14 0 0 1 -14 12 L180 298 a14 14 0 0 1 -14 -12 Z"
        fill="url(#hero-bag)"
      />
      <path d="M226 122 L300 122 L286 286 a14 14 0 0 1 -14 12 L226 298 Z" fill="#EFA475" opacity="0.45" />
      <path
        d="M188 122 C188 80 214 62 226 62 C238 62 264 80 264 122"
        fill="none"
        stroke="#E8702A"
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* discount tag */}
      <g transform="rotate(-12 124 196)">
        <path
          d="M96 150 L150 150 a16 16 0 0 1 16 16 L166 220 a16 16 0 0 1 -16 16 L96 236 a16 16 0 0 1 -16 -16 L80 166 a16 16 0 0 1 16 -16 Z"
          fill="url(#hero-tag)"
        />
        <circle cx="105" cy="173" r="9" fill="#FFFFFF" />
        <circle cx="105" cy="173" r="4" fill="#C2410C" />
        <text
          x="129"
          y="212"
          textAnchor="middle"
          fontFamily="system-ui, sans-serif"
          fontSize="58"
          fontWeight="700"
          fill="#FFFFFF"
        >
          %
        </text>
      </g>
    </svg>
  );
}
