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
import ScreeningReport from './ScreeningReport';
import { DR_LABELS } from '@/lib/simulate-ai';
import { toast } from 'sonner';
import { Stethoscope, Loader2, Sparkles, Send, MessageSquare, FileText, Eye } from 'lucide-react';

interface DoctorReviewPanelProps {
  screeningId: string;
  onClose: () => void;
}

export default function DoctorReviewPanel({ screeningId, onClose }: DoctorReviewPanelProps) {
  const { user } = useAuth();
  const [screening, setScreening] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [clinicalReport, setClinicalReport] = useState('');
  const [patientSummary, setPatientSummary] = useState('');
  const [form, setForm] = useState({
    final_risk: '',
    final_diagnosis: '',
    clinical_notes: '',
    ai_override: false,
    patient_summary: '',
    posterior_annotation: '',
    anterior_annotation: '',
  });

  useEffect(() => {
    const fetchData = async () => {
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
          posterior_annotation: r.posterior_annotation || '',
          anterior_annotation: r.anterior_annotation || '',
        });
        // If summary already exists, pre-fill
        if (r.patient_summary) {
          setPatientSummary(r.patient_summary);
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [screeningId]);

  const handleGenerateReport = async () => {
    if (!screening) return;
    setGeneratingReport(true);
    try {
      const ai = screening.ai_results?.[0];
      const patient = screening.patients;

      // Parse heatmap regions
      let heatmapRegions = null;
      if (ai?.heatmap_url) {
        try {
          const parsed = JSON.parse(ai.heatmap_url.match(/\{[\s\S]*\}/)?.[0] || ai.heatmap_url);
          heatmapRegions = parsed.regions || null;
        } catch { /* plain text */ }
      }

      const { data, error } = await supabase.functions.invoke('generate-summary', {
        body: {
          patientName: patient?.name,
          age: patient?.age,
          gender: patient?.gender,
          contact: patient?.contact,
          diabetesHistory: patient?.diabetes_history,
          drClass: ai?.dr_class,
          drLabel: DR_LABELS[ai?.dr_class as number],
          confidence: ai?.confidence_score,
          diabetesRisk: ai?.diabetes_risk_score,
          unifiedRisk: form.final_risk || ai?.unified_risk,
          doctorNotes: form.clinical_notes,
          diagnosis: form.final_diagnosis,
          posteriorAnnotation: form.posterior_annotation,
          anteriorAnnotation: form.anterior_annotation,
          heatmapRegions,
          screeningDate: screening.created_at,
          screeningId: screening.id,
          reportType: 'both',
        },
      });
      if (error) throw error;

      setClinicalReport(data.clinicalReport || '');
      setPatientSummary(data.patientSummary || '');
      setForm(f => ({ ...f, patient_summary: data.patientSummary || '' }));
      setShowReport(true);
      toast.success('Reports generated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate reports');
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleSendSms = async () => {
    if (!screening?.patients?.contact) {
      toast.error('No contact number available for this patient');
      return;
    }
    setSendingSms(true);
    try {
      const ai = screening.ai_results?.[0];
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: {
          phone: screening.patients.contact,
          patientName: screening.patients.name,
          riskLevel: form.final_risk || ai?.unified_risk || 'low',
          drGrade: ai?.dr_class || 0,
          summary: form.patient_summary,
        },
      });
      if (error) throw error;
      if (data?.sent) {
        toast.success('SMS notification sent successfully');
      } else {
        toast.info(`SMS logged (${data?.provider || 'no provider'}). Configure Twilio for live SMS.`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send SMS');
    } finally {
      setSendingSms(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !screening) return;
    setSubmitting(true);
    try {
      const existingReview = screening.doctor_reviews?.[0];
      const reviewData = {
        final_risk: form.final_risk || null,
        final_diagnosis: form.final_diagnosis || null,
        clinical_notes: form.clinical_notes || null,
        ai_override: form.ai_override,
        patient_summary: form.patient_summary || null,
      };

      if (existingReview) {
        const { error } = await (supabase as any).from('doctor_reviews').update(reviewData).eq('id', existingReview.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('doctor_reviews').insert({
          ...reviewData,
          screening_id: screeningId,
          doctor_id: user.id,
        });
        if (error) throw error;
      }

      await (supabase as any).from('screenings').update({ status: 'reviewed' }).eq('id', screeningId);
      toast.success('Review saved successfully');

      if (screening.patients?.contact) {
        handleSendSms();
      }

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

  // Parse heatmap analysis
  let heatmapRegions: any[] = [];
  if (ai?.heatmap_url) {
    try {
      const parsed = JSON.parse(ai.heatmap_url.match(/\{[\s\S]*\}/)?.[0] || ai.heatmap_url);
      heatmapRegions = parsed.regions || [];
    } catch { /* plain text */ }
  }

  // If showing the full report
  if (showReport) {
    return (
      <ScreeningReport
        screening={screening}
        doctorReview={screening.doctor_reviews?.[0] || (form.final_risk ? form : null)}
        clinicalReport={clinicalReport}
        patientSummary={patientSummary}
        onClose={() => setShowReport(false)}
      />
    );
  }

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
            <p className="text-sm text-muted-foreground">
              {patient?.age}y, {patient?.gender} · {patient?.diabetes_history || 'No history recorded'}
              {patient?.contact && <span className="ml-2">📱 {patient.contact}</span>}
            </p>
          </div>

          {/* Fundus image */}
          <img
            src={screening.image_url}
            alt="Fundus"
            className="w-full max-h-72 object-contain rounded-lg border bg-muted"
          />

          {/* AI Heatmap Regions */}
          {heatmapRegions.length > 0 && (
            <div className="p-3 rounded-lg border bg-destructive/5 space-y-2">
              <p className="text-sm font-bold flex items-center gap-1.5">🔥 AI Heatmap — Regions of Concern</p>
              <div className="space-y-1.5">
                {heatmapRegions.map((r: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <Badge variant={r.severity === 'severe' ? 'destructive' : 'secondary'} className="text-[10px] mt-0.5">
                      {r.severity}
                    </Badge>
                    <span><strong>{r.location}</strong>: {r.lesion}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!heatmapRegions.length && ai?.heatmap_url && ai.heatmap_url.length > 20 && (
            <div className="p-3 rounded-lg border bg-accent/5 space-y-2">
              <p className="text-sm font-bold">🔬 AI Detailed Analysis</p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{ai.heatmap_url}</p>
            </div>
          )}

          {/* AI results summary */}
          {ai && (
            <div className="p-3 rounded-lg border bg-accent/5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-primary" /> AI Prediction
                </p>
                <RiskBadge risk={ai.unified_risk} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">DR Classification</p><p className="font-semibold">{DR_LABELS[ai.dr_class as number]}</p></div>
                <div><p className="text-xs text-muted-foreground">Confidence</p><p className="font-semibold">{(ai.confidence_score * 100).toFixed(1)}%</p></div>
                <div><p className="text-xs text-muted-foreground">Diabetes Risk</p><p className="font-semibold">{((ai.diabetes_risk_score || 0) * 100).toFixed(1)}%</p></div>
                <div><p className="text-xs text-muted-foreground">Grade</p><Badge variant="secondary" className="text-[10px] py-0">{ai.dr_class}/4</Badge></div>
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
              <Textarea value={form.clinical_notes} onChange={(e) => setForm({ ...form, clinical_notes: e.target.value })} placeholder="Observations, recommendations..." rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Posterior Retina Annotation</Label>
                <Textarea value={form.posterior_annotation} onChange={(e) => setForm({ ...form, posterior_annotation: e.target.value })} placeholder="Macula, discs, hemorrhages..." rows={2} className="text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Anterior Retina Annotation</Label>
                <Textarea value={form.anterior_annotation} onChange={(e) => setForm({ ...form, anterior_annotation: e.target.value })} placeholder="Vessels, periphery, NV..." rows={2} className="text-sm" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.ai_override} onCheckedChange={(v) => setForm({ ...form, ai_override: v })} />
              <Label className="text-sm">Override AI classification</Label>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-2">
            {/* Generate Report Button */}
            <Button
              variant="outline"
              onClick={handleGenerateReport}
              disabled={generatingReport}
              className="w-full"
            >
              {generatingReport ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Generating Clinical + Patient Reports...</>
              ) : (
                <><FileText className="w-4 h-4 mr-1" /> Generate Detailed Reports (Clinical + Patient)</>
              )}
            </Button>

            {/* View existing report if already generated */}
            {(clinicalReport || patientSummary) && (
              <Button variant="secondary" onClick={() => setShowReport(true)} className="w-full">
                <Eye className="w-4 h-4 mr-1" /> View Generated Reports
              </Button>
            )}

            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Send className="w-4 h-4 mr-1" /> Save & Notify</>}
              </Button>
              <Button variant="outline" size="sm" onClick={handleSendSms} disabled={sendingSms || !patient?.contact}>
                {sendingSms ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
              </Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
