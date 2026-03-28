
DROP POLICY "System can insert ai_results" ON public.ai_results;
CREATE POLICY "Authenticated users can insert ai_results" ON public.ai_results FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.screenings WHERE id = screening_id AND created_by = auth.uid())
  OR public.has_role(auth.uid(), 'doctor')
  OR public.has_role(auth.uid(), 'admin')
);
