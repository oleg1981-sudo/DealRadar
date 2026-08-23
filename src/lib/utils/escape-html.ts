/**
 * HTML-escape for values interpolated into the transactional email templates.
 *
 * Extracted from alerts.repo.ts when the TravelDeal launch email needed the
 * same thing — two hand-rolled copies of an escaper is one more than can be
 * audited, and this one is the security boundary between stored text and an
 * email body.
 */
const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ENTITIES[c]!);
}
