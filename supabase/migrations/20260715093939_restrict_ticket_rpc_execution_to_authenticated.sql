REVOKE ALL ON FUNCTION public.claim_ticket(varchar) FROM anon;
REVOKE ALL ON FUNCTION public.forward_ticket_to_it(varchar) FROM anon;
REVOKE ALL ON FUNCTION public.reassign_it_ticket(varchar, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.complete_ticket(varchar, uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.return_ticket_to_nas(varchar, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM anon;
