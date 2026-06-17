'use client';

/** Renders its children only on the home route ("/", locale-stripped). */
import { usePathname } from '@/i18n/routing';

export function HomeOnly({ children }: { children: React.ReactNode }) {
  return usePathname() === '/' ? <>{children}</> : null;
}
