CREATE OR REPLACE FUNCTION public.complete_ticket(
  p_ticket_id varchar,
  p_expected_assigned_to uuid,
  p_resolution_notes text,
  p_internal_notes text,
  p_closed_reason text
)
RETURNS SETOF public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_role text;
  updated_ticket public.tickets;
BEGIN
  SELECT role INTO actor_role FROM public.users WHERE id = actor_id;
  IF actor_role NOT IN ('nas', 'it') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only NAS or IT staff can complete tickets.';
  END IF;
  IF p_closed_reason IS NOT NULL AND actor_role <> 'it' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only IT staff can close or reject tickets.';
  END IF;

  UPDATE public.tickets
  SET status = 'resolved',
      resolution_notes = p_resolution_notes,
      internal_notes = p_internal_notes,
      closed_reason = p_closed_reason
  WHERE id = p_ticket_id
    AND assigned_to IS NOT DISTINCT FROM p_expected_assigned_to
    AND (
      (actor_role = 'it' AND status IN ('open', 'in_progress'))
      OR (
        actor_role = 'nas'
        AND current_handler = 'nas'
        AND status = 'in_progress'
        AND assigned_to = actor_id
      )
    )
  RETURNING * INTO updated_ticket;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This ticket changed before it could be completed.';
  END IF;

  INSERT INTO public.ticket_history (ticket_id, action, performed_by, details)
  VALUES (
    updated_ticket.id,
    CASE WHEN p_closed_reason IS NULL THEN 'resolved' ELSE 'closed' END,
    actor_id,
    CASE WHEN p_closed_reason IS NULL THEN 'Resolved' ELSE 'Closed or rejected' END
  );
  RETURN NEXT updated_ticket;
END;
$$;
