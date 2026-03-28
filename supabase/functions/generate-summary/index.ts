import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      patientName, age, gender, drClass, drLabel,
      confidence, diabetesRisk, unifiedRisk,
      doctorNotes, diagnosis,
      posteriorAnnotation, anteriorAnnotation,
      findings, cdssAnalysis,
      heatmapRegions, diabetesHistory, contact,
      screeningDate, screeningId,
      reportType, // 'clinical' | 'patient' | 'both'
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const patientContext = `
Patient: ${patientName}, ${age} years old, ${gender}
Contact: ${contact || 'N/A'}
Diabetes History: ${diabetesHistory || 'Not reported'}
Screening Date: ${screeningDate || new Date().toLocaleDateString()}
Screening ID: ${screeningId || 'N/A'}

Eye Screening Results:
- DR Classification: ${drLabel} (Grade ${drClass}/4)
  0=No DR, 1=Mild NPDR, 2=Moderate NPDR, 3=Severe NPDR, 4=Proliferative DR
- AI Confidence: ${((confidence || 0) * 100).toFixed(1)}%
- Diabetes Risk Score: ${((diabetesRisk || 0) * 100).toFixed(1)}%
- Overall Risk Level: ${unifiedRisk}

Clinical Findings:
${diagnosis ? `- Final Diagnosis: ${diagnosis}` : '- No final diagnosis yet'}
${findings ? `- AI Findings: ${findings}` : ''}
${cdssAnalysis ? `- CDSS Analysis: ${cdssAnalysis}` : ''}
${posteriorAnnotation ? `- Posterior Retina Notes: ${posteriorAnnotation}` : ''}
${anteriorAnnotation ? `- Anterior Retina Notes: ${anteriorAnnotation}` : ''}
${doctorNotes ? `- Doctor's Observations: ${doctorNotes}` : ''}
${heatmapRegions ? `- Heatmap Regions: ${JSON.stringify(heatmapRegions)}` : ''}`;

    const type = reportType || 'both';
    const results: any = {};

    // Generate Clinical Report
    if (type === 'clinical' || type === 'both') {
      const clinicalPrompt = `Generate a comprehensive CLINICAL REPORT for a doctor/medical professional based on this diabetic retinopathy screening.

${patientContext}

Structure the report with these sections (use clear headers):

A. PATIENT INFORMATION — Demographics, diabetes history, screening details
B. FUNDUS ANALYSIS — DR classification with grade explanation, what was detected
C. AI EXPLAINABILITY — Key lesion regions found (microaneurysms, hemorrhages, exudates, etc.), their locations and severity
D. CDSS DIABETES RISK — Risk score, contributing factors, risk category
E. COMBINED RISK ASSESSMENT — Final risk level with logic explanation (e.g., "Moderate DR + High diabetes risk → High overall risk")
F. CLINICAL FINDINGS — Doctor's observations, annotations, diagnosis
G. RECOMMENDATIONS — Follow-up timeline, referral needs, suggested tests
H. AUDIT — AI model info, confidence level, timestamp

Use precise medical terminology. Be thorough but structured. Include confidence transparency.`;

      const clinicalResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "You are a senior ophthalmologist generating a formal clinical report for diabetic retinopathy screening. Use precise medical language, structured sections, and include all clinical details. This report will be saved, printed, and used for medical records." },
            { role: "user", content: clinicalPrompt },
          ],
        }),
      });

      if (!clinicalResponse.ok) {
        if (clinicalResponse.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (clinicalResponse.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const t = await clinicalResponse.text();
        console.error("Clinical AI error:", clinicalResponse.status, t);
        throw new Error("Failed to generate clinical report");
      }

      const clinicalData = await clinicalResponse.json();
      results.clinicalReport = clinicalData.choices?.[0]?.message?.content || "Unable to generate clinical report.";
    }

    // Generate Patient-Friendly Summary
    if (type === 'patient' || type === 'both') {
      const patientPrompt = `Generate a PATIENT-FRIENDLY SUMMARY for someone with limited medical knowledge based on this screening.

${patientContext}

Structure the summary with these sections:

1. YOUR RESULT — Simple one-line result like "Your eye condition is: [Low/Moderate/High] Risk"
2. WHAT WE FOUND — Explain in simple, reassuring language what was detected (no medical jargon)
3. WHAT IT MEANS — Explain what this means for their health in everyday language
4. WHAT TO DO NEXT — Clear, actionable steps:
   - For HIGH: "Visit an eye doctor within 7 days"
   - For MODERATE: "Schedule a follow-up in 1 month"
   - For LOW: "Routine check-up every 12 months"
5. HEALTHY TIPS — 3-4 simple lifestyle tips
6. FOLLOW-UP — When the next screening should be

Keep it under 250 words. Use warm, reassuring tone. Avoid ALL medical jargon. Use simple words a person with basic education can understand.`;

      const patientResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "You are a compassionate health communicator at a rural clinic. Write in simple, warm, reassuring language that a person with basic education can easily understand. Avoid ALL medical jargon. Be caring and clear. Use short sentences." },
            { role: "user", content: patientPrompt },
          ],
        }),
      });

      if (!patientResponse.ok) {
        const t = await patientResponse.text();
        console.error("Patient summary AI error:", patientResponse.status, t);
        throw new Error("Failed to generate patient summary");
      }

      const patientData = await patientResponse.json();
      results.patientSummary = patientData.choices?.[0]?.message?.content || "Unable to generate summary.";
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
