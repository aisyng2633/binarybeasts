import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ImageQualityCheck from './ImageQualityCheck';
import { toast } from 'sonner';
import { Camera, Upload, X, Loader2, AlertTriangle } from 'lucide-react';

interface FundusUploadProps {
  patientId: string;
  onScreeningCreated: () => void;
}

export default function FundusUpload({ patientId, onScreeningCreated }: FundusUploadProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [qualityPassed, setQualityPassed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [vitals, setVitals] = useState({
    fbs: '',
    ppbs: '',
    rbs: '',
    hba1c: '',
    systolic_bp: '',
    diastolic_bp: '',
    heart_rate: '',
    weight: '',
    height: '',
    diabetes_duration: '',
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleVitalChange = (name: string, value: string) => {
    setVitals(prev => ({ ...prev, [name]: value }));
  };

  const handleFile = (f: File) => {
    if (!f.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setQualityPassed(false);
  };

  const resetFile = () => {
    setFile(null);
    setPreview(null);
    setQualityPassed(false);
    setProcessingStep('');
  };

  const handleSubmit = async () => {
    if (!file || !user) return;
    setUploading(true);
    try {
      // Step 1: Upload image
      setProcessingStep('Uploading fundus image...');
      const ext = file.name.split('.').pop();
      const path = `${user.id}/${patientId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('fundus-images').upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from('fundus-images').getPublicUrl(path);

      // Step 2: Create screening record with vitals
      setProcessingStep('Creating screening record...');
      const { data: screening, error: screenErr } = await (supabase as any).from('screenings').insert({
        patient_id: patientId,
        image_url: publicUrl,
        created_by: user.id,
        status: 'processing',
        fbs: vitals.fbs ? parseFloat(vitals.fbs) : null,
        ppbs: vitals.ppbs ? parseFloat(vitals.ppbs) : null,
        rbs: vitals.rbs ? parseFloat(vitals.rbs) : null,
        hba1c: vitals.hba1c ? parseFloat(vitals.hba1c) : null,
        systolic_bp: vitals.systolic_bp ? parseInt(vitals.systolic_bp) : null,
        diastolic_bp: vitals.diastolic_bp ? parseInt(vitals.diastolic_bp) : null,
        heart_rate: vitals.heart_rate ? parseInt(vitals.heart_rate) : null,
        weight: vitals.weight ? parseFloat(vitals.weight) : null,
        height: vitals.height ? parseFloat(vitals.height) : null,
        diabetes_duration: vitals.diabetes_duration ? parseInt(vitals.diabetes_duration) : null,
      }).select('id').single();
      if (screenErr) throw screenErr;

      // Step 3: AI Analysis (Fundus DR + CDSS Diabetes Risk + Heatmap)
      setProcessingStep('Running AI Fundus Analysis + CDSS Diabetes Risk...');
      const { data: aiResponse, error: aiErr } = await supabase.functions.invoke('process-screening', {
        body: { screeningId: (screening as any).id },
      });

      if (aiErr) {
        console.error('Edge function error:', aiErr);
        toast.error('AI processing encountered an error. Screening saved for manual review.');
      } else {
        const risk = aiResponse.unifiedRisk?.toUpperCase();
        const drLabel = aiResponse.drLabel || `Grade ${aiResponse.drClass}`;
        const confidence = ((aiResponse.confidence || 0) * 100).toFixed(0);
        
        toast.success(
          `Screening complete — ${drLabel} (${confidence}% confidence), Risk: ${risk}`,
          { duration: 5000 }
        );
        
        if (risk === 'HIGH') {
          toast.warning('⚠️ HIGH RISK: Immediate specialist referral recommended!', { duration: 8000 });
        }

        if (aiResponse.findings) {
          toast.info(`AI Findings: ${aiResponse.findings}`, { duration: 6000 });
        }
      }

      resetFile();
      onScreeningCreated();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      setProcessingStep('');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Camera className="w-5 h-5 text-primary" />
          Upload Fundus Image
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Clinical Measurements Section */}
        <div className="pt-2 border-t space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <AlertTriangle className="w-4 h-4" />
            Clinical Measurements (Optional)
          </div>
          
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase">FBS (mg/dL)</Label>
              <Input type="number" size={1} className="h-8 text-sm" value={vitals.fbs} onChange={(e) => handleVitalChange('fbs', e.target.value)} placeholder="Fasting" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase">PPBS (mg/dL)</Label>
              <Input type="number" className="h-8 text-sm" value={vitals.ppbs} onChange={(e) => handleVitalChange('ppbs', e.target.value)} placeholder="Post-P" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase">RBS (mg/dL)</Label>
              <Input type="number" className="h-8 text-sm" value={vitals.rbs} onChange={(e) => handleVitalChange('rbs', e.target.value)} placeholder="Random" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase">HbA1c (%)</Label>
              <Input type="number" step="0.1" className="h-8 text-sm" value={vitals.hba1c} onChange={(e) => handleVitalChange('hba1c', e.target.value)} placeholder="A1c" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase">BP Systolic</Label>
              <Input type="number" className="h-8 text-sm" value={vitals.systolic_bp} onChange={(e) => handleVitalChange('systolic_bp', e.target.value)} placeholder="120" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase">BP Diastolic</Label>
              <Input type="number" className="h-8 text-sm" value={vitals.diastolic_bp} onChange={(e) => handleVitalChange('diastolic_bp', e.target.value)} placeholder="80" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase">Heart Rate</Label>
              <Input type="number" className="h-8 text-sm" value={vitals.heart_rate} onChange={(e) => handleVitalChange('heart_rate', e.target.value)} placeholder="72" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase">Weight (kg)</Label>
              <Input type="number" step="0.1" className="h-8 text-sm" value={vitals.weight} onChange={(e) => handleVitalChange('weight', e.target.value)} placeholder="70" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase">Height (cm)</Label>
              <Input type="number" className="h-8 text-sm" value={vitals.height} onChange={(e) => handleVitalChange('height', e.target.value)} placeholder="170" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase">DM Duration</Label>
              <Input type="number" className="h-8 text-sm" value={vitals.diabetes_duration} onChange={(e) => handleVitalChange('diabetes_duration', e.target.value)} placeholder="Years" />
            </div>
          </div>
        </div>

        {uploading && processingStep && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm text-primary font-medium">{processingStep}</span>
          </div>
        )}

        <Button onClick={handleSubmit} disabled={!file || !qualityPassed || uploading} className="w-full">
          {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : 'Submit for AI Screening'}
        </Button>
      </CardContent>
    </Card>
  );
}
