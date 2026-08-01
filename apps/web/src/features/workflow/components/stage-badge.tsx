import type { badgeVariants } from '@repo/ui';
import { Badge } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export function StageBadge({ label, variant }: { label: string; variant: BadgeVariant }) {
  return <Badge variant={variant}>{label}</Badge>;
}
