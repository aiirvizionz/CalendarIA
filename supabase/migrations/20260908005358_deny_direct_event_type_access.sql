create policy "deny direct access to user preferences"
on public.user_event_preferences
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny direct access to event types"
on public.event_types
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
