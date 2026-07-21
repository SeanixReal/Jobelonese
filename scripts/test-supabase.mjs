import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: node scripts/test-supabase.mjs <email> <password>');
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) {
  console.error('AUTH ERROR:', authError.message);
  process.exit(1);
}
console.log('AUTH OK:', auth.user.id, auth.user.email);

const { data: profile, error: profileError } = await supabase
  .from('users')
  .select('*')
  .eq('id', auth.user.id)
  .single();
console.log('PROFILE:', profileError ? `ERROR: ${profileError.message}` : profile);

const ticketSelect =
  '*, labs(name), stations(station_number), user:users!tickets_user_id_fkey(fullname, email, student_or_staff_id, program), assigned_user:users!tickets_assigned_to_fkey(fullname, email)';

const { data: tickets, error: ticketsError } = await supabase
  .from('tickets')
  .select(ticketSelect)
  .limit(3);
console.log('TICKETS:', ticketsError ? `ERROR: ${ticketsError.message}` : `${tickets?.length ?? 0} rows`);

const { data: users, error: usersError } = await supabase.from('users').select('*').limit(3);
console.log('USERS:', usersError ? `ERROR: ${usersError.message}` : `${users?.length ?? 0} rows`);

const { data: history, error: historyError } = await supabase
  .from('ticket_history')
  .select('*, users:users(fullname)')
  .limit(3);
console.log('HISTORY:', historyError ? `ERROR: ${historyError.message}` : `${history?.length ?? 0} rows`);

await supabase.auth.signOut();
