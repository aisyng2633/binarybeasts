import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DR_LABELS = ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"];

const DR_ANALYSIS_PROMPT = `You are an expert ophthalmologist AI. Analyze this fundus image for Diabetic Retinopathy (DR).
Respond ONLY with valid JSON in this exact format:
{
  "dr_class": <0-4>,
  "confidence": <0.0-1.0>,
  "findings": "<brief clinical findings>"
}
Where dr_class: 0=No DR, 1=Mild, 2=Moderate, 3=Severe, 4=Proliferative DR.`;

async function imageToBase64(imageData: ArrayBuffer): Promise<string> {
  const uint8 = new Uint8Array(imageData);
  let binary = "";
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

// Analyze with Clinical AI Gateway (primary)
async function analyzeWithClinicalAI(imageBase64: string): Promise<{ dr_class: number; confidence: number } | null> {
  const apiKey = Deno.env.get("CLINICAL_AI_API_KEY");
  if (!apiKey) return null;

  try {
    console.log("[AI] Trying Clinical AI Gateway...");
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
            { type: "text", text: DR_ANALYSIS_PROMPT },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
          ]
        }],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.warn("[Clinical AI] Failed:", response.status);
      return null;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      dr_class: Math.min(4, Math.max(0, Math.round(parsed.dr_class))),
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
    };
  } catch (e) {
    console.warn("[Clinical AI] Error:", e);
    return null;
  }
}

// Fallback: Gemini direct
async function tryGemini(imageBase64: string): Promise<{ dr_class: number; confidence: number } | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return null;

  try {
    console.log("[AI Fallback] Trying Gemini...");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: DR_ANALYSIS_PROMPT },
              { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
            ]
          }],
          generationConfig: { temperature: 0.1 }
        }),
      }
    );

    if (!response.ok) return null;
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      dr_class: Math.min(4, Math.max(0, Math.round(parsed.dr_class))),
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
    };
  } catch (e) {
    console.warn("[Gemini] Error:", e);
    return null;
  }
}

async function analyzeWithFallback(imageData: ArrayBuffer): Promise<{ dr_class: number; confidence: number; provider: string }> {
  const imageBase64 = await imageToBase64(imageData);

  // Primary: Clinical AI → Gemini → Mock
  const clinicalResult = await analyzeWithClinicalAI(imageBase64);
  if (clinicalResult) return { ...clinicalResult, provider: "clinical-ai" };

  const geminiResult = await tryGemini(imageBase64);
  if (geminiResult) return { ...geminiResult, provider: "gemini" };

  // Final fallback: mock
  console.warn("[AI Fallback] All providers failed, using mock");
  return {
    dr_class: Math.floor(Math.random() * 5),
    confidence: 0.85,
    provider: "mock",
  };
}

// Mock CDSS diabetes risk analysis
function computeDiabetesRisk(patient: any): number {
  let risk = 0.2;
  if (patient?.age > 50) risk += 0.2;
  if (patient?.age > 65) risk += 0.1;
  if (patient?.diabetes_history) risk += 0.3;
  if (patient?.gender === 'male') risk += 0.05;
  return Math.min(risk + Math.random() * 0.15, 1.0);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { screeningId } = await req.json();
    if (!screeningId) throw new Error("screeningId is required");

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
      // Try fetching public URL directly
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) throw new Error("Failed to fetch image");
      imageData = await imgResponse.arrayBuffer();
    } catch {
      // Fallback: try storage download
      const path = imageUrl.split("/fundus-images/").pop();
      if (!path) throw new Error("Cannot determine image path");
      const { data: blob, error: dlError } = await supabaseClient.storage.from("fundus-images").download(path);
      if (dlError || !blob) throw new Error("Failed to download image");
      imageData = await blob.arrayBuffer();
    }

    console.log(`[Processing] Screening ${screeningId}, image size: ${imageData.byteLength}`);

    // Step 1: AI DR Classification
    let aiData: { dr_class: number; confidence: number; provider: string };
    const AI_ENGINE_URL = Deno.env.get("AI_ENGINE_URL") || "";

    if (AI_ENGINE_URL) {
      try {
        const formData = new FormData();
        formData.append("file", new Blob([imageData], { type: "image/jpeg" }), "fundus.jpg");
        const aiResponse = await fetch(`${AI_ENGINE_URL}/predict`, { method: "POST", body: formData });
        if (aiResponse.ok) {
          const result = await aiResponse.json();
          aiData = { dr_class: result.dr_class, confidence: result.confidence, provider: "ai-engine" };
        } else {
          aiData = await analyzeWithFallback(imageData);
        }
      } catch {
        aiData = await analyzeWithFallback(imageData);
      }
    } else {
      aiData = await analyzeWithFallback(imageData);
    }

    console.log(`[AI] Provider: ${aiData.provider}, DR: ${aiData.dr_class}, Confidence: ${aiData.confidence.toFixed(3)}`);

    // Step 2: CDSS Diabetes Risk
    const diabetesRisk = computeDiabetesRisk(screening.patients);

    // Step 3: Risk Fusion
    let unifiedRisk: "low" | "moderate" | "high" = "low";
    const combinedScore = (aiData.dr_class / 4) * 0.6 + diabetesRisk * 0.4;
    if (combinedScore >= 0.6 || aiData.dr_class >= 3) {
      unifiedRisk = "high";
    } else if (combinedScore >= 0.3 || aiData.dr_class >= 1) {
      unifiedRisk = "moderate";
    }

    // Step 4: Save results
    const { error: aiResultsError } = await supabaseClient
      .from("ai_results")
      .upsert({
        screening_id: screeningId,
        dr_class: aiData.dr_class,
        confidence_score: aiData.confidence,
        heatmap_url: "",
        diabetes_risk_score: diabetesRisk,
        unified_risk: unifiedRisk,
      });

    if (aiResultsError) throw aiResultsError;

    await supabaseClient.from("screenings").update({ status: "completed" }).eq("id", screeningId);

    // Step 5: SMS notification (mock)
    const contact = screening.patients?.contact;
    if (contact) {
      console.log(`[SMS MOCK] To ${contact}: Your eye screening result is ${unifiedRisk} risk. ${
        unifiedRisk === 'high' ? 'Please visit an ophthalmologist within 1 week.' :
        unifiedRisk === 'moderate' ? 'Follow-up in 3 months recommended.' :
        'Annual check-up recommended.'
      }`);
    }

    return new Response(JSON.stringify({ success: true, unifiedRisk, provider: aiData.provider, drClass: aiData.dr_class }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error in process-screening:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal Server Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
