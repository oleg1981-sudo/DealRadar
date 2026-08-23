/**
 * The card page an unsubscribe link lands on.
 *
 * Extracted from /api/alerts/unsubscribe when the TravelDeal launch list needed
 * the same page with different copy. Only the shell lives here — each route
 * supplies its own translated strings, because "you will no longer receive
 * price-drop alerts for this deal" is not what a launch-list removal should say.
 *
 * `noindex` matters: these URLs carry an email address in the query string and
 * must never reach an index.
 */
export interface UnsubscribePage {
  locale: string;
  title: string;
  body: string;
  /** Present only on the confirmation step, which POSTs back to the same URL. */
  buttonText?: string;
}

export function unsubscribePageHtml({ locale, title, body, buttonText }: UnsubscribePage): string {
  const actionHtml = buttonText
    ? `<form method="POST">
        <button type="submit" style="background:#EA580C;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;transition:background 0.2s">
          ${buttonText}
        </button>
       </form>`
    : '';

  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title}</title></head>
    <body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:50px;color:#18181b;background:#fafafa;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;margin:0">
      <div style="background:#fff;padding:40px;border-radius:12px;box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);max-width:440px;width:100%;box-sizing:border-box">
        <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;line-height:1.25">${title}</h2>
        <p style="color:#71717a;font-size:14px;line-height:1.5;margin:0 0 24px">${body}</p>
        ${actionHtml}
      </div>
    </body></html>`;
}
