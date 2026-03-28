
-- Add annotation columns to doctor_reviews
ALTER TABLE public.doctor_reviews 
ADD COLUMN IF NOT EXISTS posterior_annotation TEXT,
ADD COLUMN IF NOT EXISTS anterior_annotation TEXT;
