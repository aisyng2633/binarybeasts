import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { patientName, age, gender, drClass, drLabel, confidence, diabetesRisk, unifiedRisk, doctorNotes, diagnosis } = await req.json();

    const CLINICAL_AI_API_KEY = Deno.env.get("CLINICAL_AI_API_KEY");
    if (!CLINICAL_AI_API_KEY) throw new Error("CLINICAL_AI_API_KEY is not configured");

    const prompt = `Generate a simple, patient-friendly medical summary in plain language (suitable for someone with limited medical knowledge). Keep it under 200 words.

Patient: ${patientName}, ${age} years old, ${gender}
Eye Screening Results:
- Diabetic Retinopathy Classification: ${drLabel} (Class ${drClass}/4)
- AI Confidence: ${(confidence * 100).toFixed(1)}%
- Diabetes Risk Score: ${(diabetesRisk * 100).toFixed(1)}%
- Overall Risk Level: ${unifiedRisk}
${diagnosis ? `Doctor's Diagnosis: ${diagnosis}` : ''}
${doctorNotes ? `Doctor's Notes: ${doctorNotes}` : ''}

Include:
1. What was found in simple terms
2. What the risk level means
3. What the patient should do next
4. When to follow up`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CLINICAL_AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a compassionate medical communicator. Write patient-friendly summaries in simple, reassuring language. Avoid medical jargon. Be clear about next steps." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || "Unable to generate summary.";

    return new Response(JSON.stringify({ summary }), {
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
