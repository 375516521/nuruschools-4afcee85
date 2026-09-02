ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS grade_id uuid REFERENCES public.grades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.streams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS asset_tag text;

CREATE UNIQUE INDEX IF NOT EXISTS assets_tag_unique ON public.assets (school_id, upper(asset_tag)) WHERE asset_tag IS NOT NULL;

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS morning_status text NOT NULL DEFAULT 'present',
  ADD COLUMN IF NOT EXISTS afternoon_status text NOT NULL DEFAULT 'present';