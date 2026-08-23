import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared capture across the hoisted mocks.
const h = vi.hoisted(() => ({
  rows: [] as any[],
  updates: [] as { id: unknown; vals: any }[],
  deletes: [] as { col: string; val: unknown }[],
  emails: [] as any[],
  sendOk: true,
}));

vi.mock('server-only', () => ({}));

vi.mock('next-intl/server', () => ({
  // Deterministic, locale-tagged strings — enough to prove each recipient is
  // rendered in THEIR locale without pinning the test to real copy.
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    (key: string) => `${locale}/${namespace}.${key}`,
}));

vi.mock('../email/send', () => ({
  sendEmail: vi.fn(async (msg: any) => {
    h.emails.push(msg);
    return h.sendOk;
  }),
}));

vi.mock('./supabase', () => ({
  supabaseConfigured: () => true,
  supabase: () => {
    const b: any = {
      _op: 'select',
      _vals: undefined,
      select() { b._op = 'select'; return b; },
      update(vals: any) { b._op = 'update'; b._vals = vals; return b; },
      delete() { b._op = 'delete'; return b; },
      insert() { b._op = 'insert'; return b; },
      in() { return b; },
      order() { return b; },
      limit() { return b; },
      eq(col: string, val: unknown) {
        if (b._op === 'update' && col === 'id') h.updates.push({ id: val, vals: b._vals });
        if (b._op === 'delete') h.deletes.push({ col, val });
        return b;
      },
      then(resolve: (r: any) => void) {
        resolve(b._op === 'select' ? { data: h.rows, error: null } : { error: null });
      },
    };
    return { from: () => b };
  },
}));

import {
  notifyTravelLaunch,
  unsubscribeTravelSignup,
  travelUnsubscribeUrl,
  TRAVEL_LAUNCH_SCOPE,
} from './travel-signups.repo';
import { generateUnsubscribeToken } from '../utils/crypto';

function row(id: string, email: string, locale: string, sourceSlug: string | null = 'cruises') {
  return { id, email, locale, source_slug: sourceSlug };
}

beforeEach(() => {
  h.rows = [];
  h.updates = [];
  h.deletes = [];
  h.emails = [];
  h.sendOk = true;
});

describe('notifyTravelLaunch — dry run', () => {
  it('sends nothing and flips nothing', async () => {
    h.rows = [row('1', 'a@example.com', 'de'), row('2', 'b@example.com', 'fr')];

    const res = await notifyTravelLaunch({ dryRun: true });

    expect(res.dryRun).toBe(true);
    expect(res.recipients).toBe(2);
    expect(res.sent).toBe(0);
    expect(h.emails).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
  });

  it('returns one rendered sample per locale, not per recipient', async () => {
    h.rows = [
      row('1', 'a@example.com', 'de'),
      row('2', 'b@example.com', 'de'),
      row('3', 'c@example.com', 'sv'),
    ];

    const res = await notifyTravelLaunch({ dryRun: true });

    expect(res.byLocale).toEqual({ de: 2, sv: 1 });
    expect(res.samples.map((s) => s.locale)).toEqual(['de', 'sv']);
    // Each sample is rendered in its own locale — the defect CLAUDE.md §2 warns
    // about would show every sample rendered in one language.
    expect(res.samples[0].subject).toBe('de/travelLaunchEmail.subject');
    expect(res.samples[1].subject).toBe('sv/travelLaunchEmail.subject');
  });
});

describe('notifyTravelLaunch — real send', () => {
  it('sends, then flips notified with a timestamp', async () => {
    h.rows = [row('1', 'a@example.com', 'de')];

    const res = await notifyTravelLaunch({ dryRun: false });

    expect(res.sent).toBe(1);
    expect(res.failed).toBe(0);
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0].to).toBe('a@example.com');
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0].id).toBe('1');
    expect(h.updates[0].vals.notified).toBe(true);
    expect(typeof h.updates[0].vals.notified_at).toBe('string');
  });

  it('carries the RFC 8058 one-click unsubscribe headers', async () => {
    h.rows = [row('1', 'a@example.com', 'de')];

    await notifyTravelLaunch({ dryRun: false });

    const headers = h.emails[0].headers;
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(headers['List-Unsubscribe']).toMatch(/^<https?:\/\/.+\/api\/travel-notify\/unsubscribe\?.+>$/);
  });

  it('leaves the row pending when the send fails, so nobody is silently dropped', async () => {
    h.rows = [row('1', 'a@example.com', 'de')];
    h.sendOk = false;

    const res = await notifyTravelLaunch({ dryRun: false });

    expect(res.sent).toBe(0);
    expect(res.failed).toBe(1);
    expect(h.updates).toHaveLength(0);
  });

  it('falls back to a valid slug when the stored source_slug is not a real one', async () => {
    h.rows = [row('1', 'a@example.com', 'de', 'not-a-real-slug')];

    await notifyTravelLaunch({ dryRun: false });

    expect(h.emails[0].html).toContain('/de/traveldeal/cruises');
    expect(h.emails[0].html).not.toContain('not-a-real-slug');
  });
});

describe('unsubscribeTravelSignup', () => {
  it('rejects a bad token and touches nothing', async () => {
    expect(await unsubscribeTravelSignup('a@example.com', 'deadbeef')).toBe(false);
    expect(h.deletes).toHaveLength(0);
  });

  it('accepts a valid token and deletes the row', async () => {
    const token = generateUnsubscribeToken('a@example.com', TRAVEL_LAUNCH_SCOPE);

    expect(await unsubscribeTravelSignup('a@example.com', token)).toBe(true);
    expect(h.deletes).toEqual([{ col: 'email', val: 'a@example.com' }]);
  });

  it('will not accept a token minted for the price-alert list', async () => {
    // Scope isolation: the same email signed up to both lists must not have one
    // unsubscribe link silently clear the other.
    const alertToken = generateUnsubscribeToken('a@example.com', 'some-product-id');

    expect(await unsubscribeTravelSignup('a@example.com', alertToken)).toBe(false);
    expect(h.deletes).toHaveLength(0);
  });
});

describe('travelUnsubscribeUrl', () => {
  it('round-trips with the verifier', async () => {
    const url = new URL(travelUnsubscribeUrl('Mixed.Case@Example.com', 'de'));
    const email = url.searchParams.get('email')!;
    const token = url.searchParams.get('token')!;

    expect(url.pathname).toBe('/api/travel-notify/unsubscribe');
    expect(url.searchParams.get('locale')).toBe('de');
    expect(await unsubscribeTravelSignup(email, token)).toBe(true);
  });
});
