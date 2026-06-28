'use client';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';

/**
 * Transparency requirement (FR-COMP-2): every outbound affiliate CTA carries this
 * visible, localized badge. Do not remove or hide — GDPR/UWG/EU 2005/29/EC.
 */
export function SponsoredBadge({ className }: { className?: string }) {
  const t = useTranslations('deal');
  return (
    <Badge variant="sponsored" title={t('affiliateBadgeTooltip')} className={cn(className)}>
      {t('affiliateBadge')}
    </Badge>
  );
}
