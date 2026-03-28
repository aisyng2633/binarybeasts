import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageQualityCheckProps {
  file: File;
  onPass: () => void;
  onRetake: () => void;
}

export default function ImageQualityCheck({ file, onPass, onRetake }: ImageQualityCheckProps) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ valid: boolean; issues: string[] } | null>(null);

  const checkQuality = async () => {
    setChecking(true);
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });

      const issues: string[] = [];

      // Check resolution
      if (img.width < 300 || img.height < 300) {
        issues.push('Image resolution too low (min 300x300)');
      }

      // Check file size (too small might be low quality)
      if (file.size < 10000) {
        issues.push('Image file size too small — may lack detail');
      }

      // Check aspect ratio (fundus images are roughly square)
      const ratio = img.width / img.height;
      if (ratio < 0.5 || ratio > 2) {
        issues.push('Unusual aspect ratio for a fundus image');
      }

      // Canvas-based blur/brightness check
      const canvas = document.createElement('canvas');
      const size = 200;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);
      const data = imageData.data;

      // Average brightness
      let totalBrightness = 0;
      for (let i = 0; i < data.length; i += 4) {
        totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      const avgBrightness = totalBrightness / (data.length / 4);

      if (avgBrightness < 30) {
        issues.push('Image appears too dark');
      } else if (avgBrightness > 240) {
        issues.push('Image appears overexposed');
      }

      URL.revokeObjectURL(url);
      setResult({ valid: issues.length === 0, issues });

      if (issues.length === 0) {
        setTimeout(onPass, 800);
      }
    } catch {
      setResult({ valid: false, issues: ['Failed to analyze image'] });
    } finally {
      setChecking(false);
    }
  };

  // Auto-check on mount or file change
  useEffect(() => {
    if (file) {
      setResult(null);
      checkQuality();
    }
  }, [file]);

  return (
    <div className="p-4 rounded-lg border bg-card space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {checking ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
            Checking image quality...
          </>
        ) : result?.valid ? (
          <>
            <CheckCircle className="w-4 h-4 text-risk-low" />
            Image quality check passed
          </>
        ) : (
          <>
            <AlertTriangle className="w-4 h-4 text-risk-high" />
            Image quality issues detected
          </>
        )}
      </div>

      {result && !result.valid && (
        <div className="space-y-2">
          <ul className="text-xs text-muted-foreground space-y-1">
            {result.issues.map((issue, i) => (
              <li key={i}>• {issue}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onRetake}>
              <RefreshCw className="w-3 h-3 mr-1" /> Retake
            </Button>
            <Button size="sm" variant="secondary" onClick={onPass}>
              Continue Anyway
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
