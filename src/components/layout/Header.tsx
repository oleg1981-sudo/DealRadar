import { Link } from '@/i18n/routing';
import { SearchBar } from '@/components/search/SearchBar';
import { LocationPicker } from './LocationPicker';
import { Radar } from 'lucide-react';

/** Top bar: logo (left), search (center), location+language picker (right).
 *  Language moved INTO LocationPicker — it used to be a separate control here
 *  on desktop and in the footer on mobile, i.e. at the bottom of the page. */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-1.5" aria-label="DealRadar — home">
          <Radar className="h-6 w-6 text-accent" aria-hidden />
          <span className="hidden text-lg font-semibold tracking-tight sm:inline">
            Deal<span className="text-accent">Radar</span>
          </span>
        </Link>

        <div className="flex flex-1 justify-center">
          <SearchBar />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <LocationPicker />
        </div>
      </div>
    </header>
  );
}
