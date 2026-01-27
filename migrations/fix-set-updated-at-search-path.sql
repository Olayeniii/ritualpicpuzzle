-- Fix "Function Search Path Mutable" warning for public.set_updated_at
-- This migration recreates the function with a fixed search_path to prevent security issues

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;

-- Recreate the function with a fixed search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Set the updated_at column to the current timestamp
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Add a comment explaining the function
COMMENT ON FUNCTION public.set_updated_at() IS 
'Trigger function to automatically update the updated_at timestamp. Uses fixed search_path for security.';

-- Recreate triggers for all tables that use updated_at
-- (Add or modify these based on your actual tables)

-- Tournaments table
DROP TRIGGER IF EXISTS set_updated_at_tournaments ON public.tournaments;
CREATE TRIGGER set_updated_at_tournaments
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Rounds table
DROP TRIGGER IF EXISTS set_updated_at_rounds ON public.rounds;
CREATE TRIGGER set_updated_at_rounds
  BEFORE UPDATE ON public.rounds
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Tournament schedule table
DROP TRIGGER IF EXISTS set_updated_at_tournament_schedule ON public.tournament_schedule;
CREATE TRIGGER set_updated_at_tournament_schedule
  BEFORE UPDATE ON public.tournament_schedule
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Leaderboard table
DROP TRIGGER IF EXISTS set_updated_at_leaderboard ON public.leaderboard;
CREATE TRIGGER set_updated_at_leaderboard
  BEFORE UPDATE ON public.leaderboard
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Note: Only create triggers for tables that exist in your database
-- If you add admin_users or audit_log tables later, add their triggers then

