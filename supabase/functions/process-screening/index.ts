import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DR_LABELS = ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"];

async function imageToBase64(imageData: ArrayBuffer): Promise<string> {
  const uint8 = new Uint8Array(imageData);
  let binary = "";
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

// Fundus DR Analysis via Lovable AI (vision model)
async function analyzeFundusWithAI(imageBase64: string, apiKey: string): Promise<{ dr_class: number; confidence: number; findings: string }> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `You are an expert ophthalmologist AI analyzing a retinal fundus image for Diabetic Retinopathy (DR).

Analyze this fundus image carefully. Look for:
- Microaneurysms, hemorrhages, hard exudates, cotton wool spots
- Neovascularization, venous beading, intraretinal microvascular abnormalities
- Macular edema signs

Respond ONLY with valid JSON:
{"dr_class": <0-4>, "confidence": <0.0-1.0>, "findings": "<brief clinical findings>"}

dr_class scale: 0=No DR, 1=Mild NPDR, 2=Moderate NPDR, 3=Severe NPDR, 4=Proliferative DR`
          },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
          }
        ]
      }],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Fundus AI] Error:", response.status, errText);
    throw new Error(`Fundus AI analysis failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) throw new Error("Could not parse AI response");

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    dr_class: Math.min(4, Math.max(0, Math.round(parsed.dr_class))),
    confidence: Math.min(1, Math.max(0, parsed.confidence)),
    findings: parsed.findings || "",
  };
}

// Generate Grad-CAM style heatmap description via AI
async function generateHeatmapAnalysis(imageBase64: string, drClass: number, apiKey: string): Promise<string> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this retinal fundus image. The DR classification is ${DR_LABELS[drClass]} (Grade ${drClass}/4).

Identify the KEY REGIONS of concern. For each region describe:
- Location (e.g., "superior temporal arcade", "macula", "optic disc")
- Type of lesion found
- Severity

This will be used to create a clinical annotation overlay. Be precise and clinical.
Respond as JSON: {"regions": [{"location": "...", "lesion": "...", "severity": "mild|moderate|severe"}]}`
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
            }
          ]
        }],
        temperature: 0.2,
      }),
    });

    if (!response.ok) return "";
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

// AIIMS CDSS Diabetes Risk Analysis via AI
async function analyzeDiabetesRisk(patient: any, vitals: any, apiKey: string): Promise<{ risk_score: number; analysis: string }> {
  const patientData = {
    age: patient?.age || 0,
    gender: patient?.gender || "unknown",
    diabetes_history: patient?.diabetes_history || "none reported",
    name: patient?.name || "Unknown",
    vitals: {
      fbs: vitals?.fbs,
      ppbs: vitals?.ppbs,
      rbs: vitals?.rbs,
      hba1c: vitals?.hba1c,
      bp: vitals?.systolic_bp ? `${vitals.systolic_bp}/${vitals.diastolic_bp}` : "unknown",
      duration: vitals?.diabetes_duration,
    }
  };

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash",
      messages: [
        {
          role: "system",
          content: `You are the AIIMS Clinical Decision Support System (CDSS) for diabetes risk assessment. 
Analyze patient data and vitals to provide a diabetes risk score based on clinical guidelines.
Consider: blood sugar levels, HbA1c, blood pressure, duration of diabetes, and patient history.
Respond ONLY with valid JSON: {"risk_score": <0.0-1.0>, "analysis": "<brief risk factors>"}`
        },
        {
          role: "user",
          content: `Assess diabetes risk for this patient:
- Age: ${patientData.age} years
- Gender: ${patientData.gender}
- Diabetes History: ${patientData.diabetes_history}
- DM Duration: ${patientData.vitals.duration} years
- FBS: ${patientData.vitals.fbs} mg/dL
- PPBS: ${patientData.vitals.ppbs} mg/dL
- RBS: ${patientData.vitals.rbs} mg/dL
- HbA1c: ${patientData.vitals.hba1c}%
- Blood Pressure: ${patientData.vitals.bp} mmHg

Provide a risk score (0.0 = no risk, 1.0 = highest risk) based on AIIMS clinical guidelines for diabetic retinopathy screening.`
        }
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    console.warn("[CDSS] AI analysis failed, using rule-based fallback");
    // Fallback: rule-based
    let risk = 0.15;
    if (patientData.age > 45) risk += 0.1;
    if (patientData.vitals.hba1c && parseFloat(patientData.vitals.hba1c) > 7) risk += 0.3;
    if (patientData.vitals.fbs && parseFloat(patientData.vitals.fbs) > 126) risk += 0.2;
    if (patientData.vitals.duration && parseInt(patientData.vitals.duration) > 10) risk += 0.2;
    
    const history = patientData.diabetes_history.toLowerCase();
    if (history.includes("yes") || history.includes("confirmed")) risk += 0.2;
    
    return { risk_score: Math.min(Math.max(risk, 0.05), 0.98), analysis: "Rule-based assessment (fallback)" };
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    return { risk_score: 0.3, analysis: "Could not parse CDSS response" };
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    risk_score: Math.min(1, Math.max(0, parsed.risk_score)),
    analysis: parsed.analysis || "",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { screeningId } = await req.json();
    if (!screeningId) throw new Error("screeningId is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch screening with patient data
    const { data: screening, error: screeningError } = await supabaseClient
      .from("screenings")
      .select("*, patients(*)")
      .eq("id", screeningId)
      .single();

    if (screeningError || !screening) throw new Error("Screening not found");

    // Update status to processing
    await supabaseClient.from("screenings").update({ status: "processing" }).eq("id", screeningId);

    // Download the fundus image
    const imageUrl = screening.image_url;
    let imageData: ArrayBuffer;

    try {
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) throw new Error("Failed to fetch image");
      imageData = await imgResponse.arrayBuffer();
    } catch {
      const path = imageUrl.split("/fundus-images/").pop();
      if (!path) throw new Error("Cannot determine image path");
      const { data: blob, error: dlError } = await supabaseClient.storage.from("fundus-images").download(path);
      if (dlError || !blob) throw new Error("Failed to download image");
      imageData = await blob.arrayBuffer();
    }

    console.log(`[Processing] Screening ${screeningId}, image size: ${imageData.byteLength}`);
    const imageBase64 = await imageToBase64(imageData);

    // === PARALLEL AI ANALYSIS ===
    // Step 1: Fundus DR Classification (AI Vision)
    // Step 2: AIIMS CDSS Diabetes Risk Analysis (AI Text)
    const [drResult, cdssResult] = await Promise.all([
      analyzeFundusWithAI(imageBase64, LOVABLE_API_KEY),
      analyzeDiabetesRisk(screening.patients, screening, LOVABLE_API_KEY),
    ]);

    console.log(`[Fundus AI] DR Class: ${drResult.dr_class}, Confidence: ${drResult.confidence.toFixed(3)}, Findings: ${drResult.findings}`);
    console.log(`[CDSS] Diabetes Risk: ${cdssResult.risk_score.toFixed(3)}, Analysis: ${cdssResult.analysis}`);

    // Step 3: Generate heatmap analysis (non-blocking)
    const heatmapAnalysis = await generateHeatmapAnalysis(imageBase64, drResult.dr_class, LOVABLE_API_KEY);

    // Step 4: Risk Fusion (Weights: AI DR 60%, CDSS Risk 40%)
    let unifiedRisk: "low" | "moderate" | "high" = "low";
    const drNormalized = drResult.dr_class / 4;
    const combinedScore = (drNormalized * 0.6) + (cdssResult.risk_score * 0.4);

    if (drResult.dr_class >= 3 || combinedScore >= 0.65) {
      unifiedRisk = "high";
    } else if (drResult.dr_class >= 1 || combinedScore >= 0.35) {
      unifiedRisk = "moderate";
    }

    console.log(`[Fusion] Combined Score: ${combinedScore.toFixed(3)} -> Unified Risk: ${unifiedRisk.toUpperCase()}`);

    // Step 5: Save results to database
    const { error: aiResultsError } = await supabaseClient
      .from("ai_results")
      .upsert({
        screening_id: screeningId,
        dr_class: drResult.dr_class,
        confidence_score: drResult.confidence,
        heatmap_url: heatmapAnalysis || "",
        diabetes_risk_score: cdssResult.risk_score,
        unified_risk: unifiedRisk,
      });

    if (aiResultsError) throw aiResultsError;

    await supabaseClient.from("screenings").update({ status: "completed" }).eq("id", screeningId);

    // Step 6: SMS Notification for high-risk cases
    const contact = screening.patients?.contact;
    if (contact && unifiedRisk === "high") {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            phone: contact,
            patientName: screening.patients.name,
            riskLevel: unifiedRisk,
            drGrade: drResult.dr_class,
          }),
        });
      } catch (smsErr) {
        console.warn("[SMS] Failed to send notification:", smsErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      unifiedRisk,
      drClass: drResult.dr_class,
      drLabel: DR_LABELS[drResult.dr_class],
      confidence: drResult.confidence,
      diabetesRisk: cdssResult.risk_score,
      findings: drResult.findings,
      cdssAnalysis: cdssResult.analysis,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Error in process-screening:", e);
    
    // Handle rate limit and payment errors
    if (e instanceof Error) {
      if (e.message.includes("429")) {
        return new Response(JSON.stringify({ error: "AI rate limited, please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (e.message.includes("402")) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal Server Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
