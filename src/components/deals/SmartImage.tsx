/**
 * next/image with a graceful degradation path [FR-2.2 tripwire class]: an
 * image whose host is not in the shared allowlist renders as a plain <img>
 * (unoptimized, lazy) instead of throwing "hostname not configured" and
 * 500-ing the whole PDP. The watchdog still alerts so the host gets added —
 * degradation is the safety net, not the steady state.
 */
import Image, { type ImageProps } from 'next/image';
import { isAllowedImageHost } from '@/lib/utils/image-hosts';

type Props = Omit<ImageProps, 'src'> & { readonly src: string };

export function SmartImage({ src, alt, ...rest }: Props) {
  if (isAllowedImageHost(src)) return <Image src={src} alt={alt} {...rest} />;
  const { fill, width, height, className, sizes: _sizes, priority: _priority, ...img } = rest as Record<string, unknown>;
  void _sizes; void _priority;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- deliberate fallback: unlisted host must degrade, never crash
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`${className ?? ''}${fill ? ' absolute inset-0 h-full w-full' : ''}`}
      {...(fill ? {} : { width: width as number, height: height as number })}
      {...(img as object)}
    />
  );
}
