import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import RiskBadge from './RiskBadge';
import { DR_LABELS } from '@/lib/simulate-ai';
import { toast } from 'sonner';
import { Stethoscope, Loader2, Sparkles } from 'lucide-react';

interface DoctorReviewPanelProps {
  screeningId: string;
  onClose: () => void;
}

export default function DoctorReviewPanel({ screeningId, onClose }: DoctorReviewPanelProps) {
  const { user } = useAuth();
  const [screening, setScreening] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [form, setForm] = useState({
    final_risk: '',
    final_diagnosis: '',
    clinical_notes: '',
    ai_override: false,
    patient_summary: '',
  });

  useEffect(() => {
    const fetch = async () => {
      const { data } = await (supabase as any)
        .from('screenings')
        .select(`
          *, patients(*),
          ai_results(*),
          doctor_reviews(*)
        `)
        .eq('id', screeningId)
        .single();
      setScreening(data);
      if ((data as any)?.doctor_reviews?.[0]) {
        const r = (data as any).doctor_reviews[0];
        setForm({
          final_risk: r.final_risk || '',
          final_diagnosis: r.final_diagnosis || '',
          clinical_notes: r.clinical_notes || '',
          ai_override: r.ai_override || false,
          patient_summary: r.patient_summary || '',
        });
      }
      setLoading(false);
    };
    fetch();
  }, [screeningId]);

  const handleGenerateSummary = async () => {
    if (!screening) return;
    setGeneratingSummary(true);
    try {
      const ai = screening.ai_results?.[0];
      const patient = screening.patients;
      const { data, error } = await supabase.functions.invoke('generate-summary', {
        body: {
          patientName: patient?.name,
          age: patient?.age,
          gender: patient?.gender,
          drClass: ai?.dr_class,
          drLabel: DR_LABELS[ai?.dr_class as number],
          confidence: ai?.confidence_score,
          diabetesRisk: ai?.diabetes_risk_score,
          unifiedRisk: form.final_risk || ai?.unified_risk,
          doctorNotes: form.clinical_notes,
          diagnosis: form.final_diagnosis,
        },
      });
      if (error) throw error;
      setForm((f) => ({ ...f, patient_summary: data.summary }));
      toast.success('Summary generated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate summary');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !screening) return;
    setSubmitting(true);
    try {
      const existingReview = screening.doctor_reviews?.[0];
      if (existingReview) {
        const { error } = await (supabase as any).from('doctor_reviews').update({
          final_risk: form.final_risk || null,
          final_diagnosis: form.final_diagnosis || null,
          clinical_notes: form.clinical_notes || null,
          ai_override: form.ai_override,
          patient_summary: form.patient_summary || null,
        }).eq('id', existingReview.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('doctor_reviews').insert({
          screening_id: screeningId,
          doctor_id: user.id,
          final_risk: form.final_risk || null,
          final_diagnosis: form.final_diagnosis || null,
          clinical_notes: form.clinical_notes || null,
          ai_override: form.ai_override,
          patient_summary: form.patient_summary || null,
        });
        if (error) throw error;
      }

      await (supabase as any).from('screenings').update({ status: 'reviewed' }).eq('id', screeningId);
      toast.success('Review saved');
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  if (!screening) return <div className="text-center py-8 text-muted-foreground">Screening not found</div>;

  const ai = screening.ai_results?.[0];
  const patient = screening.patients;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Stethoscope className="w-5 h-5 text-primary" />
            Doctor Review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Patient info */}
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="font-semibold">{patient?.name}</p>
            <p className="text-sm text-muted-foreground">{patient?.age}y, {patient?.gender} · {patient?.diabetes_history || 'No history recorded'}</p>
          </div>

          {/* Fundus image with Heatmap Toggle */}
          <div className="relative group">
            <img 
              src={showHeatmap && ai?.heatmap_url ? `data:image/jpeg;base64,${ai.heatmap_url}` : screening.image_url} 
              alt="Fundus" 
              className="w-full max-h-72 object-contain rounded-lg border bg-muted transition-all duration-300" 
            />
            {ai?.heatmap_url && (
              <Button
                variant="secondary"
                size="sm"
                className="absolute bottom-2 right-2 opacity-90 hover:opacity-100"
                onClick={() => setShowHeatmap(!showHeatmap)}
              >
                {showHeatmap ? 'Show Original' : 'Show AI Heatmap'}
              </Button>
            )}
          </div>

          {/* AI results */}
          {ai && (
            <div className="p-3 rounded-lg border bg-accent/5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-primary" />
                  AI Prediction
                </p>
                <RiskBadge risk={ai.unified_risk} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">DR Classification</p>
                  <p className="font-semibold">{DR_LABELS[ai.dr_class as number]}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">AI Confidence</p>
                  <p className="font-semibold">{(ai.confidence_score * 100).toFixed(1)}%</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Diabetes Risk (CDSS)</p>
                  <p className="font-semibold">{(ai.diabetes_risk_score * 100).toFixed(1)}%</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Detection Grade</p>
                  <Badge variant="secondary" className="text-[10px] py-0">{ai.dr_class}/4</Badge>
                </div>
              </div>
            </div>
          )}

          {/* Doctor form */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Final Risk Assessment</Label>
              <Select value={form.final_risk} onValueChange={(v) => setForm({ ...form, final_risk: v })}>
                <SelectTrigger><SelectValue placeholder="Select risk level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Final Diagnosis</Label>
              <Textarea value={form.final_diagnosis} onChange={(e) => setForm({ ...form, final_diagnosis: e.target.value })} placeholder="Clinical diagnosis..." rows={2} />
            </div>

            <div className="space-y-2">
              <Label>Clinical Notes</Label>
              <Textarea value={form.clinical_notes} onChange={(e) => setForm({ ...form, clinical_notes: e.target.value })} placeholder="Observations, annotations..." rows={3} />
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.ai_override} onCheckedChange={(v) => setForm({ ...form, ai_override: v })} />
              <Label className="text-sm">Override AI classification</Label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Patient Summary</Label>
                <Button size="sm" variant="outline" onClick={handleGenerateSummary} disabled={generatingSummary}>
                  {generatingSummary ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  <span className="ml-1">Generate with AI</span>
                </Button>
              </div>
              <Textarea value={form.patient_summary} onChange={(e) => setForm({ ...form, patient_summary: e.target.value })} placeholder="Patient-friendly summary..." rows={4} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
              {submitting ? 'Saving...' : 'Save Review'}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
