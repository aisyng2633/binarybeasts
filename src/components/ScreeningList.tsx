import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import RiskBadge from './RiskBadge';
import { DR_LABELS } from '@/lib/simulate-ai';
import { ClipboardList, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ScreeningListProps {
  refreshKey: number;
  onViewScreening?: (screeningId: string) => void;
  showAll?: boolean;
}

export default function ScreeningList({ refreshKey, onViewScreening, showAll }: ScreeningListProps) {
  const [screenings, setScreenings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from('screenings')
        .select(`
          id, status, created_at, image_url,
          patients(name, age, gender),
          ai_results(dr_class, confidence_score, unified_risk),
          doctor_reviews(final_risk, final_diagnosis)
        `)
        .order('created_at', { ascending: false })
        .limit(50);
      setScreenings(data || []);
      setLoading(false);
    };
    fetch();
  }, [refreshKey]);

  if (loading) return <div className="text-center py-8 text-muted-foreground animate-pulse">Loading screenings...</div>;
  if (!screenings.length) return <div className="text-center py-8 text-muted-foreground animate-in border rounded-lg py-12 bg-muted/20">No screenings yet</div>;

  return (
    <Card className="glass-card animate-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardList className="w-5 h-5 text-primary" />
          {showAll ? 'All Screenings' : 'Recent Screenings'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {screenings.map((s) => {
          const ai = s.ai_results?.[0];
          const review = s.doctor_reviews?.[0];
          const patient = s.patients;
          return (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
              <img src={s.image_url} alt="Fundus" className="w-14 h-14 rounded-md object-cover border" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{patient?.name || 'Unknown'}</p>
                <p className="text-xs text-muted-foreground">
                  {patient?.age}y, {patient?.gender} · {new Date(s.created_at).toLocaleDateString()}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  {ai && (
                    <Badge variant="outline" className="text-xs">
                      {DR_LABELS[ai.dr_class as number]} ({(ai.confidence_score * 100).toFixed(0)}%)
                    </Badge>
                  )}
                  <RiskBadge risk={review?.final_risk || ai?.unified_risk} />
                  {review && <Badge variant="secondary" className="text-xs">Reviewed</Badge>}
                </div>
              </div>
              {onViewScreening && (
                <Button size="sm" variant="ghost" onClick={() => onViewScreening(s.id)}>
                  <Eye className="w-4 h-4" />
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
