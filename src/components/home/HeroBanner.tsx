import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { ShieldCheck } from 'lucide-react';
import { SearchBar } from '@/components/search/SearchBar';

/**
 * Home hero: headline + value prop, a prominent search (the dynamic SearchBar
 * with live suggestions) and a trust disclosure, with a decorative
 * illustration. A rounded warm-peach card constrained to the content width
 * (same as the deal grid); sits between the header and the category bar.
 * Server component.
 */
export async function HeroBanner() {
  const t = await getTranslations();

  return (
    <section className="mx-auto max-w-7xl px-4 pt-8">
      <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-[#FFF7F1] via-[#FFF0E6] to-[#FFE6D5]">
        {/* md:pr-[50px] = the radar's distance from the banner's RIGHT edge.
            Change that one value to move the radar horizontally (it's anchored
            to the edge, so it stays consistent at every screen width). */}
        <div className="grid items-stretch gap-6 px-6 py-[30px] md:grid-cols-[1fr_1fr] md:pl-10 md:pr-[50px]">
          <div>
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-4xl">
              {t.rich('home.heroTitle', {
                em: (chunks) => <span className="text-accent">{chunks}</span>,
              })}
            </h1>
            <p className="mt-3 max-w-md text-sm text-zinc-600 sm:text-base">{t('home.heroSubtitle')}</p>

            <div className="mt-5 max-w-xl">
              <SearchBar variant="hero" />
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-xs text-zinc-500">
              <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span>{t('home.heroDisclosure')}</span>
            </p>
          </div>

          {/* Radar cell spans the full card height (the -my-[30px] cancels the
              container's vertical padding), so the radar is sized by the whole
              banner — not just the text row — yet never grows it (fill is
              absolute → no intrinsic height). object-right anchors it to the
              cell's right edge, so the md:pr-[50px] above is its exact, screen-
              width-independent gap from the banner border. object-contain = 1:1. */}
          <div className="relative -my-[30px] hidden md:block">
            <Image
              src="/hero-illustration.png"
              alt=""
              fill
              sizes="400px"
              priority
              className="object-contain object-right"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
