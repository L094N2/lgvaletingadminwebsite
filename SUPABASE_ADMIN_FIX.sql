-- Run this in Supabase SQL Editor if the admin portal says your account is not admin.
-- Replace the email if your master/admin email is different.
update public.profiles
set role='master',
    permissions='["manageBookings","addManualBookings","manageReviews","viewCustomers","manageAdmins","viewAnalytics"]'::jsonb,
    disabled=false
where lower(email)=lower('logancrodden2912@icloud.com');

-- Safer profile update policies: customers can update personal details, not their role/permissions.
drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles
for update using (auth.uid() = id or public.is_master())
with check (
  public.is_master()
  or (
    auth.uid() = id
    and role = (select role from public.profiles p where p.id = auth.uid())
    and permissions = (select permissions from public.profiles p where p.id = auth.uid())
    and disabled = (select disabled from public.profiles p where p.id = auth.uid())
  )
);
