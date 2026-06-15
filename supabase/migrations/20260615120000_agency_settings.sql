-- Add settings JSONB column to agencies for storing API keys and config
ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
