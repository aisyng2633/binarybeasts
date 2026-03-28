import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const riskConfig = {
  low: { label: 'Low Risk', className: 'bg-risk-low text-white' },
  moderate: { label: 'Moderate Risk', className: 'bg-risk-moderate text-white' },
  high: { label: 'High Risk', className: 'bg-risk-high text-white' },
};

export default function RiskBadge({ risk }: { risk: string | null }) {
  if (!risk || !(risk in riskConfig)) return null;
  const config = riskConfig[risk as keyof typeof riskConfig];
  return <Badge className={cn('font-semibold', config.className)}>{config.label}</Badge>;
}
