import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ImageQualityCheck from './ImageQualityCheck';
import { toast } from 'sonner';
import { Camera, Upload, X, Loader2 } from 'lucide-react';

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
  const inputRef = useRef<HTMLInputElement>(null);

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
  };

  const handleSubmit = async () => {
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/${patientId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('fundus-images').upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from('fundus-images').getPublicUrl(path);

      const { data: screening, error: screenErr } = await (supabase as any).from('screenings').insert({
        patient_id: patientId,
        image_url: publicUrl,
        created_by: user.id,
        status: 'processing',
      }).select('id').single();
      if (screenErr) throw screenErr;

      // Call AI processing edge function
      const { data: aiResponse, error: aiErr } = await supabase.functions.invoke('process-screening', {
        body: { screeningId: (screening as any).id },
      });

      if (aiErr) {
        console.error('Edge function error:', aiErr);
        toast.error('AI processing failed, but screening is saved.');
      } else {
        toast.success(`Screening completed — Risk: ${aiResponse.unifiedRisk?.toUpperCase()}`);
      }

      resetFile();
      onScreeningCreated();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
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
        <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

        {preview ? (
          <div className="space-y-3">
            <div className="relative">
              <img src={preview} alt="Fundus preview" className="w-full max-h-64 object-contain rounded-lg border bg-muted" />
              <button onClick={resetFile} className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 hover:bg-destructive hover:text-destructive-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            {file && !qualityPassed && (
              <ImageQualityCheck
                file={file}
                onPass={() => setQualityPassed(true)}
                onRetake={resetFile}
              />
            )}
          </div>
        ) : (
          <button onClick={() => inputRef.current?.click()} className="w-full h-40 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
            <Upload className="w-8 h-8" />
            <span className="text-sm font-medium">Tap to capture or upload fundus image</span>
          </button>
        )}

        <Button onClick={handleSubmit} disabled={!file || !qualityPassed || uploading} className="w-full">
          {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : 'Submit for Screening'}
        </Button>
      </CardContent>
    </Card>
  );
}
