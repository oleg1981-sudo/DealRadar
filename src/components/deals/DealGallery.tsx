'use client';

/**
 * Product image gallery for the deal page — main image + clickable thumbnails.
 * Adapted from the retired DealDetailModal so the SSR deal pages keep the real
 * multi-image gallery the modal used to show.
 *
 * The feed's first gallery entry is the productserve proxy thumbnail (a
 * 200×200 render — blurry blown up to hero size). The merchant's own CDN
 * images that follow are the same photos at full resolution, so when any
 * exist we show only those; the tiny proxy image is kept solely as a
 * fallback for deals that ship nothing else.
 */
import { useState, type ReactNode } from 'react';
import { SmartImage as Image } from '@/components/deals/SmartImage';

const PRODUCTSERVE_RE = /(^|\.)productserve\.com\//i;

export function DealGallery({ images, alt, badge }: { images: string[]; alt: string; badge?: ReactNode }) {
  const fullRes = images.filter((u) => !PRODUCTSERVE_RE.test(u));
  const gallery = fullRes.length ? fullRes : images;
  const [active, setActive] = useState(0);

  return (
    // data-block: stable machine marker for the acceptance harness [FR-4.1].
    <div data-block="gallery" data-gallery-count={gallery.length}>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white p-6 shadow-sm">
        {gallery[active] ? (
          <Image
            src={gallery[active]}
            alt={alt}
            fill
            priority
            sizes="(max-width: 768px) 90vw, 448px"
            className="object-contain p-4"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-400">—</div>
        )}
        {badge}
      </div>
      {gallery.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {gallery.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`${alt} ${i + 1}`}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition-colors ${
                i === active ? 'border-accent' : 'border-zinc-200 hover:border-zinc-300'
              }`}
            >
              <Image src={src} alt="" fill sizes="64px" className="object-contain p-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
