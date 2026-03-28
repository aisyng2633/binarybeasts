// Simulated AI results for DR classification
const DR_LABELS = ['No DR', 'Mild', 'Moderate', 'Severe', 'Proliferative DR'] as const;

export function simulateDRClassification() {
  const drClass = Math.floor(Math.random() * 5) as 0 | 1 | 2 | 3 | 4;
  const confidence = 0.7 + Math.random() * 0.28;
  const diabetesRisk = Math.random();
  
  let unifiedRisk: 'low' | 'moderate' | 'high';
  const combinedScore = drClass / 4 * 0.6 + diabetesRisk * 0.4;
  if (combinedScore < 0.3) unifiedRisk = 'low';
  else if (combinedScore < 0.6) unifiedRisk = 'moderate';
  else unifiedRisk = 'high';

  return {
    drClass,
    drLabel: DR_LABELS[drClass],
    confidenceScore: parseFloat(confidence.toFixed(4)),
    diabetesRiskScore: parseFloat(diabetesRisk.toFixed(4)),
    unifiedRisk,
  };
}

export { DR_LABELS };
