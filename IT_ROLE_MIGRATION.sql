-- Add columns to tickets table to support IT Portal operations
ALTER TABLE public.tickets 
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS escalated_by UUID REFERENCES public.users(id) ON DELETE SET NULL NULL,
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS closed_reason TEXT NULL;

-- Create ticket_history table for auditing actions
CREATE TABLE IF NOT EXISTS public.ticket_history (
  id SERIAL PRIMARY KEY,
  ticket_id CHARACTER VARYING REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on ticket_history
ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for ticket_history
CREATE POLICY "IT can read all history" ON public.ticket_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'it')
  );

CREATE POLICY "NAS can read all history" ON public.ticket_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'nas')
  );

CREATE POLICY "Users can read their own ticket history" ON public.ticket_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tickets t 
      WHERE t.id = ticket_history.ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone authenticated can insert history" ON public.ticket_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Update users policies to allow staff (IT & NAS) to view profiles
-- Drop existing policies if needed or just add new ones
CREATE POLICY "IT can view all user profiles" ON public.users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'it')
  );

CREATE POLICY "NAS can view all user profiles" ON public.users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'nas')
  );

-- Update labs policies to allow IT staff to manage them (INSERT, UPDATE, DELETE)
CREATE POLICY "IT can insert labs" ON public.labs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'it')
  );

CREATE POLICY "IT can update labs" ON public.labs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'it')
  );

CREATE POLICY "IT can delete labs" ON public.labs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'it')
  );

-- Update stations policies to allow IT staff to manage them (INSERT, UPDATE, DELETE)
CREATE POLICY "IT can insert stations" ON public.stations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'it')
  );

CREATE POLICY "IT can update stations" ON public.stations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'it')
  );

CREATE POLICY "IT can delete stations" ON public.stations
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'it')
  );
