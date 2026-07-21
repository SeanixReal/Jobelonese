CREATE OR REPLACE FUNCTION public.cancel_nas_claim(p_ticket_id varchar)
RETURNS SETOF public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  actor_id uuid := auth.uid();
  updated_ticket public.tickets;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = actor_id
      AND role = 'nas'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only NAS staff can cancel a NAS claim.';
  END IF;

  UPDATE public.tickets
  SET status = 'open',
      assigned_to = NULL
  WHERE id = p_ticket_id
    AND current_handler = 'nas'
    AND status = 'in_progress'
    AND assigned_to = actor_id
  RETURNING * INTO updated_ticket;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'This ticket changed before your claim could be cancelled.';
  END IF;

  INSERT INTO public.ticket_history (ticket_id, action, performed_by, details)
  VALUES (
    updated_ticket.id,
    'claim_cancelled',
    actor_id,
    'Claim cancelled; returned to NAS queue'
  );

  RETURN NEXT updated_ticket;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_nas_claim(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_nas_claim(varchar) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_nas_claim(varchar) TO authenticated;
