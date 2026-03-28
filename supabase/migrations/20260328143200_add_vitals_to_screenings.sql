-- Add clinical vitals columns to screenings
ALTER TABLE public.screenings 
ADD COLUMN IF NOT EXISTS fbs NUMERIC,
ADD COLUMN IF NOT EXISTS ppbs NUMERIC,
ADD COLUMN IF NOT EXISTS rbs NUMERIC,
ADD COLUMN IF NOT EXISTS hba1c NUMERIC,
ADD COLUMN IF NOT EXISTS systolic_bp INTEGER,
ADD COLUMN IF NOT EXISTS diastolic_bp INTEGER,
ADD COLUMN IF NOT EXISTS heart_rate INTEGER,
ADD COLUMN IF NOT EXISTS weight NUMERIC,
ADD COLUMN IF NOT EXISTS height NUMERIC,
ADD COLUMN IF NOT EXISTS diabetes_duration INTEGER;

-- Add comments for clarity
COMMENT ON COLUMN public.screenings.fbs IS 'Fasting Blood Sugar (mg/dL)';
COMMENT ON COLUMN public.screenings.ppbs IS 'Post-Prandial Blood Sugar (mg/dL)';
COMMENT ON COLUMN public.screenings.rbs IS 'Random Blood Sugar (mg/dL)';
COMMENT ON COLUMN public.screenings.hba1c IS 'HbA1c percentage';
COMMENT ON COLUMN public.screenings.systolic_bp IS 'Systolic Blood Pressure (mmHg)';
COMMENT ON COLUMN public.screenings.diastolic_bp IS 'Diastolic Blood Pressure (mmHg)';
COMMENT ON COLUMN public.screenings.heart_rate IS 'Heart Rate (BPM)';
COMMENT ON COLUMN public.screenings.weight IS 'Weight (kg)';
COMMENT ON COLUMN public.screenings.height IS 'Height (cm)';
COMMENT ON COLUMN public.screenings.diabetes_duration IS 'Duration of Diabetes (years)';
