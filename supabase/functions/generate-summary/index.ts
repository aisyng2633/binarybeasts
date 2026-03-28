import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// API Keys (Official Fallbacks provided by User)
const AI_KEYS = {
  GEMINI: "AIzaSyCoZ1thW_jwGh5-3VMzbbNNE7bg6Rtfojk",
  OPENROUTER: "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",
  GROQ: "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",
};

// Unified AI Caller for Text Generation
async function callAI(messages: any[]) {
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
      model: 'meta-llama/llama-3.1-70b-instruct', 
      key: AI_KEYS.OPENROUTER 
    },
    { 
      name: 'Groq', 
      url: 'https://api.groq.com/openai/v1/chat/completions', 
      model: 'llama-3.3-70b-versatile', 
      key: AI_KEYS.GROQ 
    },
  ];

  for (const p of providers) {
    console.log(`[Summary AI] Trying ${p.name}...`);
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${p.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: p.model,
          messages,
          temperature: 0.3,
        }),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) return { content, provider: p.name };
    } catch (e) {
      console.warn(`[Summary AI] ${p.name} failed:`, e);
    }
  }
  return { content: "Medical report generation failed. Please consult a specialist.", provider: "System Fallback" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { patientInfo, aiResult, vitals } = await req.json();

    const patientContext = `Patient: ${patientInfo?.name}, Age: ${patientInfo?.age}. 
      DR Grade: ${aiResult?.dr_class}/4, Risk: ${aiResult?.unified_risk?.toUpperCase()}.
      Vitals: HbA1c ${vitals?.hba1c}%, FBS ${vitals?.fbs} mg/dL, BP ${vitals?.systolic_bp}/${vitals?.diastolic_bp}.`;

    const prompt = `
    Generate a two-part medical report for a Diabetic Retinopathy screening based on these details:
    ${patientContext}

    Structure:
    1. CLINICAL SUMMARY (Technical, for Doctors): Analyzed DR features, systemic risk assessment, and clinical reasoning.
    2. PATIENT ADVICE (Empathetic, for Local Language/Laymen): What this means, next steps (urgent/routine), and dietary tips for blood sugar management.
    
    Keep it concise and actionable.
    `;

    const result = await callAI([
      { role: "system", content: "You are an expert ophthalmology assistant. Generate a structured clinical and patient report." },
      { role: "user", content: prompt }
    ]);

    return new Response(JSON.stringify({ 
      summary: result.content,
      provider: result.provider 
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
