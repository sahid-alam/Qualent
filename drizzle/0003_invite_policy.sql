-- A signed-in person may see an unclaimed invite for their own verified email.
create policy claimable_invite on members for select to app_user
  using (user_id is null and invite_email = nullif(current_setting('app.user_email', true), ''));
