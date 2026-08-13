-- Subscription lifecycle: a checkout that has not been paid is pending,
-- not expired.  Keep this enum change isolated because PostgreSQL cannot use
-- a newly-added enum value before the transaction that adds it commits.
do $$
begin
  alter type public.subscription_status add value if not exists 'pending';
exception when duplicate_object then null;
end $$;
