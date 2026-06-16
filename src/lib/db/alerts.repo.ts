/**
 * Price-alert repository — the only module that talks to the `price_alerts`
 * table. A subscription means "email me when this product drops below the price
 * I signed up at" (target_price = the sale price at subscribe time).
 *
 * Dev behaviour: with Supabase unconfigured, subscriptions are accepted but not
 * persisted (logged), and the notify pass is a no-op — so the UI flow works
 * with an empty .env.
 */
import 'server-only';
import { supabase, supabaseConfigured } from './supabase';
import { sendEmail } from '../email/send';
import { formatPrice } from '../utils/format';
import type { NormalizedDeal } from '../providers/types';

const TABLE = 'price_alerts';

export interface PriceAlertInput {
  email: string;
  productId: string;
  productName: string;
  /** Notify once the product's sale price drops below this. */
  targetPrice: number;
  currency: string;
}

export async function createPriceAlert(a: PriceAlertInput): Promise<void> {
  if (!supabaseConfigured()) {
    console.warn(`[alerts.repo] Supabase not configured — alert not persisted: ${a.email} → ${a.productId}`);
    return;
  }
  const { error } = await supabase().from(TABLE).upsert(
    {
      email: a.email,
      product_id: a.productId,
      product_name: a.productName,
      target_price: a.targetPrice,
      currency: a.currency,
      notified: false,
      notified_at: null,
    },
    { onConflict: 'email,product_id' },
  );
  if (error) throw new Error(`[alerts.repo] upsert failed: ${error.message}`);
}

/**
 * After a refresh, email subscribers whose product is now cheaper than the
 * price they signed up at, then mark those alerts notified. No-op unless
 * Supabase is configured. Returns the number of emails dispatched.
 */
export async function notifyPriceDrops(deals: NormalizedDeal[]): Promise<number> {
  if (!supabaseConfigured() || deals.length === 0) return 0;

  const byId = new Map(deals.map((d) => [d.productId, d]));
  const { data, error } = await supabase()
    .from(TABLE)
    .select('id, email, target_price, product_id')
    .in('product_id', [...byId.keys()])
    .eq('notified', false);
  if (error) throw new Error(`[alerts.repo] query failed: ${error.message}`);

  let sent = 0;
  for (const row of data ?? []) {
    const deal = byId.get(row.product_id as string);
    if (!deal || deal.salePrice >= Number(row.target_price)) continue;

    const ok = await sendEmail({
      to: row.email as string,
      subject: `Price drop: ${deal.productName}`,
      html: priceDropEmail(deal, Number(row.target_price)),
    });
    if (ok) {
      await supabase()
        .from(TABLE)
        .update({ notified: true, notified_at: new Date().toISOString() })
        .eq('id', row.id);
      sent++;
    }
  }
  return sent;
}

function priceDropEmail(deal: NormalizedDeal, targetPrice: number): string {
  const now = formatPrice(deal.salePrice, deal.currency, 'en');
  const was = formatPrice(targetPrice, deal.currency, 'en');
  const name = escapeHtml(deal.productName);
  const shop = escapeHtml(deal.shopName);
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;color:#18181b">
  <h2 style="margin:0 0 12px">Good news — the price dropped 🎉</h2>
  <p style="margin:0 0 12px"><strong>${name}</strong> is now <strong>${now}</strong> (was ${was}) at ${shop}.</p>
  <p style="margin:0 0 20px"><a href="${deal.shopUrl}" style="display:inline-block;background:#EA580C;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:500">View the deal</a></p>
  <p style="color:#71717a;font-size:12px;margin:0">You're receiving this because you set a price alert on DealRadar.</p>
</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
