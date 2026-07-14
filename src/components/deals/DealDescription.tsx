/**
 * Product-details body for the deal PDP (server component).
 *
 * Prefers the merchant-captured description HTML (sanitized here — see
 * description-render.ts, the security boundary) and falls back to the plain
 * feed description rendered as real paragraphs. Returns null when the deal has
 * neither, so the caller can skip the whole section.
 */
import { sanitizeDescriptionHtml, splitPlainDescription } from '@/lib/utils/description-render';

// No @tailwindcss/typography in this project — style the sanitized subset via
// arbitrary variants on the wrapper instead of a plugin.
const PROSE =
  'text-sm leading-relaxed text-zinc-600 ' +
  '[&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-900 ' +
  '[&_h3]:mb-1.5 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-900 ' +
  '[&_h4]:mb-1 [&_h4]:mt-4 [&_h4]:font-semibold [&_h4]:text-zinc-800 ' +
  '[&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 ' +
  '[&_img]:my-4 [&_img]:h-auto [&_img]:w-full [&_img]:rounded-xl [&_img]:border [&_img]:border-zinc-100 [&_img]:bg-white ' +
  '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-zinc-200 [&_td]:px-2 [&_td]:py-1 ' +
  '[&_th]:border [&_th]:border-zinc-200 [&_th]:bg-zinc-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left ' +
  '[&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-200 [&_blockquote]:pl-3 ' +
  '[&_hr]:my-4 [&_hr]:border-zinc-100';

interface Props {
  readonly html?: string | null;
  readonly text?: string | null;
}

export function DealDescription({ html, text }: Props) {
  if (html) {
    const safe = sanitizeDescriptionHtml(html);
    // eslint-disable-next-line react/no-danger -- sanitized above; the allowlist is the contract
    if (safe) return <div className={PROSE} dangerouslySetInnerHTML={{ __html: safe }} />;
  }
  if (!text) return null;
  return (
    <div className={PROSE}>
      {splitPlainDescription(text).map((lines, i) => (
        // Paragraph order is the identity — the list never reorders.
        // eslint-disable-next-line react/no-array-index-key
        <p key={i}>
          {lines.map((line, j) => (
            <span key={line.slice(0, 40) + j}>
              {j > 0 && <br />}
              {line}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
