/**
 * TravelDeal — the cruise & package-holiday vertical.
 *
 * Kept SEPARATE from CATEGORIES in categories.ts on purpose. Those are retail
 * departments fed by the AWIN product feed and rendered in the scrolling bar;
 * TravelDeal is a pinned, single-vertical menu with its own supply chain, and
 * mixing them would mean the retail ingest starts trying to classify cruises.
 *
 * `source` records WHERE the inventory would come from, because the two
 * candidates are not equivalent (researched 2026-08-19):
 *
 *   awin       — TUI Cruises is already on AWIN (merchant 104581 / 9127), the
 *                network we ingest today: ~8.5% commission, DE/AT/CH/NL, AOV
 *                ~€5,500, 30-day cookie. No new integration, one brand.
 *   tourradar  — TourRadar's Distribution API: 50,000+ organised adventures
 *                from 2,500 operators, real-time pricing and availability,
 *                90-day cookie, ~6-7% commission. Needs an application; their
 *                "content providers" tier is the one that fits us.
 *
 * NOTE: neither is integrated yet. These links point at the existing search so
 * the menu is navigable, but they will return no results until a travel feed
 * actually lands.
 */

export type TravelSource = 'awin' | 'tourradar';

export interface TravelLeaf {
  name: string;
  /** Search term used until a real travel feed exists. */
  q: string;
}

export interface TravelGroup {
  name: string;
  source: TravelSource;
  children: TravelLeaf[];
}

export const TRAVEL_GROUPS: TravelGroup[] = [
  {
    // The one we could switch on this week — TUI Cruises sits in the AWIN
    // account we already hold credentials for.
    name: 'Cruises',
    source: 'awin',
    children: [
      { name: 'Ocean Cruises', q: 'Kreuzfahrt' },
      { name: 'Mein Schiff', q: 'Mein Schiff' },
      { name: 'Mediterranean', q: 'Mittelmeer Kreuzfahrt' },
      { name: 'Northern Europe', q: 'Nordeuropa Kreuzfahrt' },
      { name: 'Canary Islands', q: 'Kanaren Kreuzfahrt' },
    ],
  },
  {
    name: 'River & Expedition',
    source: 'tourradar',
    children: [
      { name: 'River Cruises', q: 'Flusskreuzfahrt' },
      { name: 'Expedition Cruises', q: 'Expedition Cruise' },
      { name: 'Nile Cruises', q: 'Nile Cruise' },
      { name: 'Danube & Rhine', q: 'Danube Rhine Cruise' },
    ],
  },
  {
    name: 'Tours & Safaris',
    source: 'tourradar',
    children: [
      { name: 'Guided Tours', q: 'Guided Tour' },
      { name: 'Safaris', q: 'Safari' },
      { name: 'Trekking & Hiking', q: 'Trekking' },
      { name: 'Cultural Tours', q: 'Cultural Tour' },
      { name: 'Small Group', q: 'Small Group Tour' },
    ],
  },
  {
    name: 'Package Holidays',
    source: 'tourradar',
    children: [
      { name: 'All-Inclusive', q: 'All Inclusive' },
      { name: 'Beach Holidays', q: 'Beach Holiday' },
      { name: 'City Breaks', q: 'City Break' },
      { name: 'Family Holidays', q: 'Family Holiday' },
    ],
  },
];

/**
 * URL slug for a group or leaf, DERIVED from the English name rather than
 * stored. A stored slug is one more thing to keep in sync, and the English name
 * is already the canonical key (it is what categoryTerm translates from).
 */
export function travelSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface TravelMatch {
  /** English name — feed into categoryTerm() for the reader's language. */
  name: string;
  /** The group it belongs to; equals `name` when the slug IS a group. */
  groupName: string;
  isGroup: boolean;
}

/** Resolve a URL slug back to a group or leaf, or null if it matches neither. */
export function findTravelBySlug(slug: string): TravelMatch | null {
  for (const group of TRAVEL_GROUPS) {
    if (travelSlug(group.name) === slug) {
      return { name: group.name, groupName: group.name, isGroup: true };
    }
    for (const leaf of group.children) {
      if (travelSlug(leaf.name) === slug) {
        return { name: leaf.name, groupName: group.name, isGroup: false };
      }
    }
  }
  return null;
}

/**
 * Human label for a source. NOT rendered to visitors — the supplier badge was
 * removed from the menu on 2026-08-20 because "AWIN" is internal plumbing that
 * means nothing to a shopper and needlessly exposes the supply chain. Kept for
 * operational use: run reports, admin views, deciding which integration to
 * build next.
 */
export const SOURCE_LABEL: Record<TravelSource, string> = {
  awin: 'AWIN',
  tourradar: 'TourRadar',
};
