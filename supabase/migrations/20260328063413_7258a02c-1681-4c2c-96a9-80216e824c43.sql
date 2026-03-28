
CREATE TYPE public.app_role AS ENUM ('asha_worker', 'doctor', 'admin');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  contact TEXT,
  diabetes_history TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read patients" ON public.patients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert patients" ON public.patients FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE TABLE public.screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'reviewed', 'completed')),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.screenings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read screenings" ON public.screenings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert screenings" ON public.screenings FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Doctors can update screenings" ON public.screenings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ai_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id UUID REFERENCES public.screenings(id) ON DELETE CASCADE NOT NULL UNIQUE,
  dr_class INTEGER NOT NULL CHECK (dr_class BETWEEN 0 AND 4),
  confidence_score NUMERIC(5,4) NOT NULL,
  heatmap_url TEXT,
  diabetes_risk_score NUMERIC(5,4),
  unified_risk TEXT CHECK (unified_risk IN ('low', 'moderate', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ai_results" ON public.ai_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert ai_results" ON public.ai_results FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE public.doctor_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id UUID REFERENCES public.screenings(id) ON DELETE CASCADE NOT NULL UNIQUE,
  doctor_id UUID REFERENCES auth.users(id) NOT NULL,
  final_diagnosis TEXT,
  final_risk TEXT CHECK (final_risk IN ('low', 'moderate', 'high')),
  clinical_notes TEXT,
  annotations JSONB,
  ai_override BOOLEAN DEFAULT false,
  patient_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.doctor_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read reviews" ON public.doctor_reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "Doctors can insert reviews" ON public.doctor_reviews FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Doctors can update own reviews" ON public.doctor_reviews FOR UPDATE TO authenticated USING (auth.uid() = doctor_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'asha_worker');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO storage.buckets (id, name, public) VALUES ('fundus-images', 'fundus-images', true);

CREATE POLICY "Authenticated users can upload fundus images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fundus-images');

CREATE POLICY "Anyone can read fundus images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fundus-images');

ALTER PUBLICATION supabase_realtime ADD TABLE public.screenings;
