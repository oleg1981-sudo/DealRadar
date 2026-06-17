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
        <div className="grid items-center gap-6 px-6 py-10 md:grid-cols-[1.2fr_1fr] md:px-10 md:py-12">
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

          <div className="hidden justify-center md:flex">
            <Image
              src="/hero-illustration.png"
              alt=""
              width={1536}
              height={1024}
              sizes="512px"
              priority
              className="h-auto w-full max-w-lg scale-[1.25] rotate-[15deg]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
