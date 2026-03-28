import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import RiskBadge from './RiskBadge';
import { DR_LABELS } from '@/lib/simulate-ai';
import {
  Printer, Download, Stethoscope, User, Eye, Brain,
  Flame, Activity, Shield, ClipboardList, Calendar,
  MessageSquare, AlertTriangle, CheckCircle, Clock,
} from 'lucide-react';

interface ScreeningReportProps {
  screening: any;
  doctorReview: any;
  clinicalReport: string;
  patientSummary: string;
  onClose: () => void;
}

const RISK_COLORS: Record<string, string> = {
  low: 'bg-risk-low text-white',
  moderate: 'bg-risk-moderate text-white',
  high: 'bg-risk-high text-white',
};

const RISK_ICONS: Record<string, typeof CheckCircle> = {
  low: CheckCircle,
  moderate: AlertTriangle,
  high: Flame,
};

export default function ScreeningReport({
  screening,
  doctorReview,
  clinicalReport,
  patientSummary,
  onClose,
}: ScreeningReportProps) {
  const [activeTab, setActiveTab] = useState('clinical');
  const reportRef = useRef<HTMLDivElement>(null);

  const ai = screening?.ai_results?.[0];
  const patient = screening?.patients;
  const finalRisk = doctorReview?.final_risk || ai?.unified_risk || 'low';
  const RiskIcon = RISK_ICONS[finalRisk] || CheckCircle;

  // Parse heatmap regions
  let heatmapRegions: any[] = [];
  if (ai?.heatmap_url) {
    try {
      const parsed = JSON.parse(ai.heatmap_url.match(/\{[\s\S]*\}/)?.[0] || ai.heatmap_url);
      heatmapRegions = parsed.regions || [];
    } catch {
      // plain text
    }
  }

  const handlePrint = () => {
    window.print();
  };

  const followUpTimeline = finalRisk === 'high'
    ? 'Within 7 days — Urgent specialist referral'
    : finalRisk === 'moderate'
      ? 'Within 1 month — Follow-up screening'
      : 'Every 12 months — Routine check-up';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-display flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          Screening Report
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="clinical" className="flex items-center gap-1.5">
            <Stethoscope className="w-3.5 h-3.5" /> Clinical Report
          </TabsTrigger>
          <TabsTrigger value="patient" className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" /> Patient Summary
          </TabsTrigger>
        </TabsList>

        {/* =================== CLINICAL REPORT =================== */}
        <TabsContent value="clinical">
          <div ref={reportRef} className="space-y-4 print:space-y-3">
            {/* Header with risk banner */}
            <div className={`p-4 rounded-lg flex items-center justify-between ${RISK_COLORS[finalRisk]} print:border print:border-current`}>
              <div className="flex items-center gap-3">
                <RiskIcon className="w-7 h-7" />
                <div>
                  <p className="font-bold text-lg font-display">
                    {finalRisk.toUpperCase()} RISK
                  </p>
                  <p className="text-sm opacity-90">Combined AI + Clinical Assessment</p>
                </div>
              </div>
              <Badge variant="outline" className="bg-white/20 text-white border-white/30 text-xs">
                {doctorReview ? '✓ Doctor Validated' : 'AI Assessment Only'}
              </Badge>
            </div>

            {/* A. Patient Information */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  A. Patient Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-muted-foreground">Name:</span> <strong>{patient?.name || 'N/A'}</strong></div>
                  <div><span className="text-muted-foreground">Age / Gender:</span> <strong>{patient?.age}y, {patient?.gender}</strong></div>
                  <div><span className="text-muted-foreground">Contact:</span> <strong>{patient?.contact || 'N/A'}</strong></div>
                  <div><span className="text-muted-foreground">Screening Date:</span> <strong>{new Date(screening?.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></div>
                  <div className="col-span-2"><span className="text-muted-foreground">Diabetes History:</span> <strong>{patient?.diabetes_history || 'Not reported'}</strong></div>
                </div>
              </CardContent>
            </Card>

            {/* B. Fundus Image */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="w-4 h-4 text-primary" />
                  B. Fundus Image
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <img
                  src={screening?.image_url}
                  alt="Fundus"
                  className="w-full max-h-64 object-contain rounded-lg border bg-muted"
                />
              </CardContent>
            </Card>

            {/* C. AI Fundus Analysis */}
            {ai && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="w-4 h-4 text-primary" />
                    C. AI Fundus Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-xs text-muted-foreground mb-1">DR Classification</p>
                      <p className="text-2xl font-bold font-display">{ai.dr_class}/4</p>
                      <Badge variant="secondary" className="mt-1">{DR_LABELS[ai.dr_class as number]}</Badge>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-xs text-muted-foreground mb-1">AI Confidence</p>
                      <p className="text-2xl font-bold font-display">{(ai.confidence_score * 100).toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {ai.confidence_score > 0.9 ? 'High confidence' : ai.confidence_score > 0.7 ? 'Moderate confidence' : 'Low confidence'}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground p-2 rounded bg-muted/30">
                    <strong>Scale:</strong> 0 = No DR · 1 = Mild NPDR · 2 = Moderate NPDR · 3 = Severe NPDR · 4 = Proliferative DR
                  </div>
                </CardContent>
              </Card>
            )}

            {/* D. Explainability — Grad-CAM / Heatmap */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Flame className="w-4 h-4 text-primary" />
                  D. AI Explainability — Regions of Concern
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {heatmapRegions.length > 0 ? (
                  <div className="space-y-2">
                    {heatmapRegions.map((r: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded border text-sm">
                        <Badge
                          variant={r.severity === 'severe' ? 'destructive' : 'secondary'}
                          className="text-[10px] mt-0.5 shrink-0"
                        >
                          {r.severity}
                        </Badge>
                        <div>
                          <p className="font-medium">{r.location}</p>
                          <p className="text-xs text-muted-foreground">{r.lesion}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : ai?.heatmap_url && ai.heatmap_url.length > 20 ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ai.heatmap_url}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No significant lesion regions detected</p>
                )}
              </CardContent>
            </Card>

            {/* E. Diabetes Risk (CDSS) */}
            {ai && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    E. CDSS Diabetes Risk Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Diabetes Risk Score</p>
                      <p className="text-2xl font-bold font-display">
                        {((ai.diabetes_risk_score || 0) * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Risk Category</p>
                      <RiskBadge risk={
                        (ai.diabetes_risk_score || 0) >= 0.65 ? 'high' :
                        (ai.diabetes_risk_score || 0) >= 0.35 ? 'moderate' : 'low'
                      } />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* F. Combined Risk Assessment */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  F. Combined Risk Assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className={`p-3 rounded-lg text-center ${RISK_COLORS[finalRisk]}`}>
                  <p className="text-xs opacity-80 mb-1">Final Risk Level</p>
                  <p className="text-xl font-bold font-display">{finalRisk.toUpperCase()}</p>
                </div>
                {ai && (
                  <p className="text-xs text-muted-foreground text-center">
                    Logic: DR Grade {ai.dr_class} ({DR_LABELS[ai.dr_class as number]}) + Diabetes Risk {((ai.diabetes_risk_score || 0) * 100).toFixed(0)}% → <strong>{finalRisk.toUpperCase()}</strong> overall risk
                  </p>
                )}
                {doctorReview?.ai_override && (
                  <p className="text-xs text-accent font-medium text-center">⚠ Doctor overrode AI classification</p>
                )}
              </CardContent>
            </Card>

            {/* G. Doctor Inputs */}
            {doctorReview && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-primary" />
                    G. Doctor Review & Annotations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {doctorReview.final_diagnosis && (
                    <div>
                      <p className="text-xs text-muted-foreground">Final Diagnosis</p>
                      <p className="font-medium">{doctorReview.final_diagnosis}</p>
                    </div>
                  )}
                  {doctorReview.clinical_notes && (
                    <div>
                      <p className="text-xs text-muted-foreground">Clinical Notes</p>
                      <p>{doctorReview.clinical_notes}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs">
                    <CheckCircle className="w-3 h-3 text-primary" />
                    <span>Reviewed on {new Date(doctorReview.created_at).toLocaleDateString('en-IN')}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* H. Clinical Recommendation */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  H. Clinical Recommendation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">Follow-up Timeline</p>
                    <p className="text-muted-foreground">{followUpTimeline}</p>
                  </div>
                </div>
                {finalRisk === 'high' && (
                  <div className="p-2 rounded bg-destructive/10 text-sm border border-destructive/20">
                    <p className="font-medium text-destructive">⚠ Referral Required</p>
                    <p className="text-xs text-muted-foreground">Immediate ophthalmologist referral recommended</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* I. Audit & Traceability */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  I. Audit & Traceability
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>AI Engine: <strong>Retinex CDSS v1.0</strong></div>
                  <div>Vision Model: <strong>Gemini 2.5 Flash</strong></div>
                  <div>CDSS Model: <strong>Gemini 3 Flash</strong></div>
                  <div>Timestamp: <strong>{new Date().toISOString()}</strong></div>
                  <div>Screening ID: <strong className="font-mono text-[10px]">{screening?.id?.slice(0, 8)}</strong></div>
                  <div>Provider: <strong>Lovable AI Gateway</strong></div>
                </div>
              </CardContent>
            </Card>

            {/* Full Clinical Report Text */}
            {clinicalReport && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    AI-Generated Clinical Report
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none text-sm whitespace-pre-wrap">
                    {clinicalReport}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* =================== PATIENT-FRIENDLY SUMMARY =================== */}
        <TabsContent value="patient">
          <div className="space-y-4 print:space-y-3">
            {/* Risk Banner */}
            <div className={`p-5 rounded-xl text-center ${RISK_COLORS[finalRisk]}`}>
              <RiskIcon className="w-10 h-10 mx-auto mb-2" />
              <p className="text-2xl font-bold font-display mb-1">
                {finalRisk === 'low' ? 'Your Eyes Look Healthy' :
                 finalRisk === 'moderate' ? 'Some Signs Were Found' :
                 'Urgent Attention Needed'}
              </p>
              <p className="text-sm opacity-90">
                Risk Level: {finalRisk.toUpperCase()}
              </p>
            </div>

            {/* A. Simple Result */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full shrink-0 ${
                    finalRisk === 'low' ? 'bg-risk-low' :
                    finalRisk === 'moderate' ? 'bg-risk-moderate' : 'bg-risk-high'
                  }`} />
                  <p className="text-lg font-medium">
                    Your eye condition is: <strong>{finalRisk.toUpperCase()} Risk</strong>
                  </p>
                </div>
                {ai && (
                  <p className="text-sm text-muted-foreground">
                    AI Confidence: {(ai.confidence_score * 100).toFixed(0)}% — {
                      ai.confidence_score > 0.9 ? 'Very reliable result' :
                      ai.confidence_score > 0.7 ? 'Reliable result' : 'Result needs doctor review'
                    }
                  </p>
                )}
              </CardContent>
            </Card>

            {/* B. Easy Explanation */}
            {patientSummary && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    What We Found
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none text-sm whitespace-pre-wrap">
                    {patientSummary}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* C. What It Means */}
            <Card>
              <CardContent className="pt-5 space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-accent" />
                  What This Means
                </p>
                <p className="text-sm text-muted-foreground">
                  {finalRisk === 'low'
                    ? 'Your eye screening shows no major concerns. Continue regular check-ups to keep your eyes healthy.'
                    : finalRisk === 'moderate'
                      ? 'We found some early signs that need monitoring. With proper care and regular check-ups, your eyes can stay healthy.'
                      : 'We found signs that need immediate attention. Early treatment can protect your vision. Please see a specialist soon.'}
                </p>
              </CardContent>
            </Card>

            {/* D. What To Do Next */}
            <Card className={finalRisk === 'high' ? 'border-destructive/50' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  What To Do Next
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className={`p-3 rounded-lg ${
                  finalRisk === 'high' ? 'bg-destructive/10 border border-destructive/20' :
                  finalRisk === 'moderate' ? 'bg-accent/10 border border-accent/20' :
                  'bg-primary/5 border border-primary/20'
                }`}>
                  <p className="font-medium text-sm">
                    {finalRisk === 'high'
                      ? '🚨 Visit an eye doctor within 7 days'
                      : finalRisk === 'moderate'
                        ? '📅 Schedule a follow-up visit within 1 month'
                        : '✅ Routine eye check-up every 12 months'}
                  </p>
                </div>

                <div className="text-sm space-y-1.5 text-muted-foreground">
                  <p>• Keep taking your diabetes medications as prescribed</p>
                  <p>• Control your blood sugar levels</p>
                  <p>• Eat a healthy diet and stay active</p>
                  {finalRisk !== 'low' && <p>• Bring this report to your eye doctor visit</p>}
                </div>
              </CardContent>
            </Card>

            {/* E. Follow-Up Plan */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-sm">Next Screening</p>
                    <p className="text-xs text-muted-foreground">{followUpTimeline}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* F. Doctor Validation */}
            {doctorReview && (
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-medium">✓ Reviewed by Certified Doctor</p>
                      <p className="text-xs text-muted-foreground">
                        This report has been verified by a medical professional on {new Date(doctorReview.created_at).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* G. Dual Intelligence */}
            <div className="text-center text-xs text-muted-foreground p-3 rounded-lg bg-muted/30">
              <p>🧠 Risk assessed using <strong>both eye scan AI</strong> and <strong>diabetes health analysis (CDSS)</strong></p>
              <p className="mt-1">Powered by Retinex CDSS · AI + Doctor Validated</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
