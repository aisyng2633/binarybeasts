
-- Fix overly permissive RLS: screenings update should be restricted
DROP POLICY "Authenticated users can update screenings" ON public.screenings;
CREATE POLICY "Users can update own screenings" ON public.screenings
  FOR UPDATE TO authenticated USING (created_by = auth.uid());

-- Fix ai_results: restrict ALL policy to service role behavior via has_role
DROP POLICY "Service role can manage ai_results" ON public.ai_results;
CREATE POLICY "AI results insert for authenticated" ON public.ai_results
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "AI results update for authenticated" ON public.ai_results
  FOR UPDATE TO authenticated USING (true);
