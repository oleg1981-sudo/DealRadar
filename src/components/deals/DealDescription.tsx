/**
 * Product-details section for the deal PDP (server component).
 *
 * Prefers the merchant-captured description HTML (sanitized here — see
 * description-render.ts, the security boundary) and falls back to the plain
 * feed description rendered as real paragraphs. Owns its whole <section>
 * including the heading, so a deal whose HTML sanitizes to nothing and has no
 * plain description renders nothing at all — never an orphaned heading.
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
  '[&_img]:mx-auto [&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl [&_img]:border [&_img]:border-zinc-100 [&_img]:bg-white ' +
  '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-zinc-200 [&_td]:px-2 [&_td]:py-1 ' +
  '[&_th]:border [&_th]:border-zinc-200 [&_th]:bg-zinc-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left ' +
  '[&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-200 [&_blockquote]:pl-3 ' +
  '[&_hr]:my-4 [&_hr]:border-zinc-100';

interface Props {
  readonly html?: string | null;
  readonly text?: string | null;
  readonly title: string;
}

export function DealDescription({ html, text, title }: Props) {
  const safe = html ? sanitizeDescriptionHtml(html) : '';
  const paragraphs = !safe && text ? splitPlainDescription(text) : [];
  if (!safe && paragraphs.length === 0) return null;
  return (
    // data-block: stable machine marker for the acceptance harness [FR-4.1/EC-15].
    <section data-block="description" className="mt-10 border-t border-zinc-100 pt-8">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900">{title}</h2>
      <div className="max-w-3xl">
        {safe ? (
          // eslint-disable-next-line react/no-danger -- sanitized above; the allowlist is the contract
          <div className={PROSE} dangerouslySetInnerHTML={{ __html: safe }} />
        ) : (
          <div className={PROSE}>
            {paragraphs.map((lines, i) => (
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
        )}
      </div>
    </section>
  );
}
