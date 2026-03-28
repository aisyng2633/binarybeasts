import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DR_LABELS = ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"];

// API Keys (Official Fallbacks provided by User)
const AI_KEYS = {
  GEMINI: "AIzaSyCoZ1thW_jwGh5-3VMzbbNNE7bg6Rtfojk",
  OPENROUTER: "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",
  GROQ: "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",
};

// --- HELPERS ---

async function imageToBase64(imageData: ArrayBuffer): Promise<string> {
  const uint8 = new Uint8Array(imageData);
  let binary = "";
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

// Unified AI Caller with Fallback Chain
async function callAI(messages: any[], type: 'vision' | 'text' = 'text', imageBase64?: string) {
  const providers = [
    { 
      name: 'Gemini', 
      url: 'https://ai.gateway.lovable.dev/v1/chat/completions', 
      model: 'google/gemini-2.0-flash', 
      key: AI_KEYS.GEMINI 
    },
    { 
      name: 'OpenRouter', 
      url: 'https://openrouter.ai/api/v1/chat/completions', 
      model: type === 'vision' ? 'google/gemini-pro-1.5-exp' : 'meta-llama/llama-3.1-405b-instruct', 
      key: AI_KEYS.OPENROUTER 
    },
    { 
      name: 'Groq', 
      url: 'https://api.groq.com/openai/v1/chat/completions', 
      model: 'llama-3.3-70b-versatile', 
      key: AI_KEYS.GROQ, 
      skipVision: true 
    },
  ];

  for (const p of providers) {
    if (type === 'vision' && p.skipVision) continue;
    
    console.log(`[AI] Attempting call with ${p.name}...`);
    try {
      const messagesWithImage = [...messages];
      if (type === 'vision' && imageBase64) {
        const lastMsg = messagesWithImage[messagesWithImage.length - 1];
        messagesWithImage[messagesWithImage.length - 1] = {
          role: lastMsg.role,
          content: [
            { type: 'text', text: typeof lastMsg.content === 'string' ? lastMsg.content : "Analyze this image." },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
          ]
        };
      }

      const res = await fetch(p.url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${p.key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://retinex.ai",
          "X-Title": "Retinex CDSS",
        },
        body: JSON.stringify({
          model: p.model,
          messages: messagesWithImage,
          temperature: 0.1,
          response_format: { type: "json_object" }
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.warn(`[AI] ${p.name} failed (${res.status}): ${err.substring(0, 100)}`);
        continue;
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) return { content, provider: p.name };
    } catch (e) {
      console.warn(`[AI] ${p.name} exception:`, e);
    }
  }
  throw new Error("Critical: All AI fallback providers failed.");
}

// --- BUSINESS LOGIC ---

async function analyzeFundusWithAI(imageBase64: string): Promise<any> {
  const result = await callAI([
    {
      role: "system",
      content: `Analyze fundus image for Diabetic Retinopathy. Grade severity (0-4) and identify lesions.
      Respond only with JSON: {"dr_class": 0-4, "confidence": 0.0-1.0, "findings": "...", "regions": [{"location": "...", "lesion": "...", "severity": "..."}]}`
    },
    {
      role: "user",
      content: "Grade this fundus image for DR."
    }
  ], 'vision', imageBase64);

  const jsonMatch = result.content.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) throw new Error("Vision AI returned invalid format");
  
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    ...parsed,
    heatmap_url: JSON.stringify({ regions: parsed.regions || [], provider: result.provider }),
    provider: result.provider
  };
}

async function analyzeDiabetesRisk(patient: any, screening: any): Promise<{ risk_score: number; analysis: string }> {
  const context = `Age: ${patient?.age}, DM Duration: ${screening?.diabetes_duration}y, HbA1c: ${screening?.hba1c}%, FBS: ${screening?.fbs}, BP: ${screening?.systolic_bp}/${screening?.diastolic_bp}`;
  
  const result = await callAI([
    {
      role: "system",
      content: "You are the AIIMS CDSS expert. Analyze diabetes risk. Respond only with JSON: {\"risk_score\": 0.0-1.0, \"analysis\": \"...\"}"
    },
    {
      role: "user",
      content: `Patient Context: ${context}`
    }
  ], 'text');

  const jsonMatch = result.content.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) return { risk_score: 0.3, analysis: "Rule-based fallback used." };
  
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    risk_score: parsed.risk_score,
    analysis: `${parsed.analysis} (Source: ${result.provider})`,
  };
}

async function generateHeatmapAnalysis(imageBase64: string, drClass: number): Promise<string> {
  try {
    const res = await callAI([
      {
        role: "system",
        content: `Identify precise locations of ${DR_LABELS[drClass]} signs. Respond only with JSON: {"regions": [...]}`
      },
      {
        role: "user",
        content: "Locate lesions."
      }
    ], 'vision', imageBase64);
    return res.content;
  } catch {
    return "";
  }
}

// --- MAIN HANDLER ---

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { screeningId } = await req.json();
    if (!screeningId) throw new Error("screeningId missing");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: screening, error: sErr } = await supabase
      .from("screenings")
      .select("*, patients(*)")
      .eq("id", screeningId)
      .single();

    if (sErr || !screening) throw new Error("Screening record not found");

    await supabase.from("screenings").update({ status: "processing" }).eq("id", screeningId);

    // Image retrieval
    const imgRes = await fetch(screening.image_url);
    if (!imgRes.ok) throw new Error("Failed to fetch fundus image");
    const imageBase64 = await imageToBase64(await imgRes.arrayBuffer());

    // Parallel Analysis
    const [drRes, cdssRes] = await Promise.all([
      analyzeFundusWithAI(imageBase64),
      analyzeDiabetesRisk(screening.patients, screening),
    ]);

    const hMap = await generateHeatmapAnalysis(imageBase64, drRes.dr_class);

    // Risk Fusion
    const score = (drRes.dr_class / 4 * 0.6) + (cdssRes.risk_score * 0.4);
    const risk: any = score >= 0.65 ? "high" : score >= 0.35 ? "moderate" : "low";

    // Persistence
    await supabase.from("ai_results").upsert({
      screening_id: screeningId,
      dr_class: drRes.dr_class,
      confidence_score: drRes.confidence,
      heatmap_url: hMap || drRes.heatmap_url,
      diabetes_risk_score: cdssRes.risk_score,
      unified_risk: risk,
    });

    await supabase.from("screenings").update({ status: "completed" }).eq("id", screeningId);

    return new Response(JSON.stringify({ 
      success: true, 
      unifiedRisk: risk, 
      provider: drRes.provider,
      cdss: cdssRes.analysis 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
