-- Auto-publication trusts only real exam-conducting bodies: gov.in, nic.in,
-- ibps.in and NTA by name. Blanket *.ac.in is removed: it covers every college
-- and any blog hosted on one.
create or replace function public.is_official_exam_url(url text)
returns boolean
language sql
immutable
as $$
  select url is not null
    and lower(url) ~ '^https://([a-z0-9-]+\.)*(gov\.in|nic\.in|ibps\.in|nta\.ac\.in)(:[0-9]+)?(/|$)'
$$;
