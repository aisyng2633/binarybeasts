import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { phone, patientName, riskLevel, drGrade, summary } = await req.json();

    if (!phone || !patientName) {
      return new Response(JSON.stringify({ error: "phone and patientName are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hospitalName = "Retinex Screening Clinic";
    
    let riskMsg = "";
    switch (riskLevel) {
      case "high":
        riskMsg = "URGENT: High Risk detected. Please visit an ophthalmologist within 7 days.";
        break;
      case "moderate":
        riskMsg = "MODERATE Risk: Please schedule a follow-up visit within 1 month.";
        break;
      default:
        riskMsg = "LOW Risk: Routine eye check-up recommended every 12 months.";
    }

    const smsMessage = `Health Alert from ${hospitalName}: Dear ${patientName}, your Diabetic Retinopathy screening is complete. ${riskMsg} For queries, contact your health worker. - Retinex CDSS`;

    console.log(`[SMS] To: ${phone}`);
    console.log(`[SMS] Message: ${smsMessage}`);

    // Check for Twilio credentials
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuth = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioFrom = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (twilioSid && twilioAuth && twilioFrom) {
      // Send via Twilio
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
      const params = new URLSearchParams({
        To: phone.startsWith("+") ? phone : `+91${phone.replace(/\D/g, "")}`,
        From: twilioFrom,
        Body: smsMessage,
      });

      const twilioResponse = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`,
        },
        body: params.toString(),
      });

      if (!twilioResponse.ok) {
        const err = await twilioResponse.text();
        console.error("[SMS Twilio] Error:", err);
        return new Response(JSON.stringify({ sent: false, provider: "twilio", error: err }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await twilioResponse.json();
      console.log("[SMS Twilio] Sent successfully:", result.sid);
      return new Response(JSON.stringify({ sent: true, provider: "twilio", sid: result.sid }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No SMS provider configured — log only
    console.log("[SMS] No SMS provider configured. Message logged only.");
    return new Response(JSON.stringify({ 
      sent: false, 
      provider: "log-only", 
      message: smsMessage,
      note: "No SMS provider configured. SMS logged to console." 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[SMS] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
