-- Phase 2: database foundation.
-- Reference/lookup data only (DATABASE.md §35) — no fake users, no fake job
-- postings, no real personal information. A real, versioned migration (not
-- supabase/seed.sql) so this data reaches every environment including
-- production, per DATABASE.md §34's "seed/reference data... via a separate,
-- idempotent seed script/migration". `code` is the stable, human-readable
-- identifier applications and other migrations reference; every insert is
-- ON CONFLICT DO NOTHING so this migration is safe to re-run.

-- States and union territories (28 states + 8 union territories).
insert into public.states (name, code, is_union_territory) values
  ('Andhra Pradesh', 'AP', false),
  ('Arunachal Pradesh', 'AR', false),
  ('Assam', 'AS', false),
  ('Bihar', 'BR', false),
  ('Chhattisgarh', 'CG', false),
  ('Goa', 'GA', false),
  ('Gujarat', 'GJ', false),
  ('Haryana', 'HR', false),
  ('Himachal Pradesh', 'HP', false),
  ('Jharkhand', 'JH', false),
  ('Karnataka', 'KA', false),
  ('Kerala', 'KL', false),
  ('Madhya Pradesh', 'MP', false),
  ('Maharashtra', 'MH', false),
  ('Manipur', 'MN', false),
  ('Meghalaya', 'ML', false),
  ('Mizoram', 'MZ', false),
  ('Nagaland', 'NL', false),
  ('Odisha', 'OD', false),
  ('Punjab', 'PB', false),
  ('Rajasthan', 'RJ', false),
  ('Sikkim', 'SK', false),
  ('Tamil Nadu', 'TN', false),
  ('Telangana', 'TG', false),
  ('Tripura', 'TR', false),
  ('Uttar Pradesh', 'UP', false),
  ('Uttarakhand', 'UK', false),
  ('West Bengal', 'WB', false),
  ('Andaman and Nicobar Islands', 'AN', true),
  ('Chandigarh', 'CH', true),
  ('Dadra and Nagar Haveli and Daman and Diu', 'DN', true),
  ('Delhi', 'DL', true),
  ('Jammu and Kashmir', 'JK', true),
  ('Ladakh', 'LA', true),
  ('Lakshadweep', 'LD', true),
  ('Puducherry', 'PY', true)
on conflict (code) do nothing;

-- Reservation categories (DATABASE.md §5 — General/UR, OBC, SC, ST, EWS only;
-- PwD/PwBD and Ex-Servicemen are statuses, not categories, see below).
insert into public.categories (code, name, description) values
  ('GENERAL', 'General / Unreserved', 'No reservation-based relaxation.'),
  ('OBC', 'Other Backward Class', 'Central/state OBC reservation category.'),
  ('SC', 'Scheduled Caste', 'Scheduled Caste reservation category.'),
  ('ST', 'Scheduled Tribe', 'Scheduled Tribe reservation category.'),
  ('EWS', 'Economically Weaker Section', 'Economically Weaker Section reservation category.')
on conflict (code) do nothing;

-- Independent special statuses (DATABASE.md §5A), composable with a category.
insert into public.statuses (code, name, description) values
  ('PWBD', 'Person with Benchmark Disability', 'PwBD/PwD status, independent of reservation category.'),
  ('EX_SERVICEMAN', 'Ex-Serviceman', 'Ex-Serviceman status, independent of reservation category.'),
  ('DEPARTMENTAL_CANDIDATE', 'Departmental Candidate', 'Existing-employee/departmental-candidate status, independent of reservation category.')
on conflict (code) do nothing;

-- Education levels, ranked for "at least X level" comparisons (DATABASE.md §7).
insert into public.education_levels (code, name, rank) values
  ('10TH', '10th / Secondary', 1),
  ('12TH', '12th / Higher Secondary', 2),
  ('ITI', 'ITI', 3),
  ('DIPLOMA', 'Diploma', 4),
  ('UG', 'Undergraduate / Bachelor''s Degree', 5),
  ('PROFESSIONAL', 'Professional Degree (e.g. MBBS, LLB)', 5),
  ('PG', 'Postgraduate / Master''s Degree', 6),
  ('DOCTORATE', 'Doctorate', 7)
on conflict (code) do nothing;

-- Common generic qualifications to bootstrap admin use (DATABASE.md §35);
-- organization/field-specific qualifications are added by admins as
-- encountered, not pre-seeded exhaustively.
insert into public.qualifications (education_level_id, code, name, is_generic)
select el.id, q.code, q.name, true
from (values
  ('ANY_BACHELOR', 'Any Bachelor''s Degree', 'UG'),
  ('ANY_DIPLOMA', 'Any Diploma', 'DIPLOMA')
) as q(code, name, level_code)
join public.education_levels el on el.code = q.level_code
on conflict (code) do nothing;

-- Job lifecycle statuses (DATABASE.md §11).
insert into public.job_statuses (code, description, sort_order) values
  ('discovered', 'A potential job/notification identified from a monitored source but not yet fetched.', 1),
  ('imported', 'Raw source content fetched and stored.', 2),
  ('processing', 'Extraction/normalization in progress (may be AI-assisted).', 3),
  ('review_required', 'Structured data exists but needs admin review.', 4),
  ('approved', 'Admin has verified the data as accurate; not yet visible to users.', 5),
  ('published', 'Visible to end users.', 6),
  ('expired', 'Application deadline has passed.', 7),
  ('archived', 'Terminal state; removed from standard views, retained for audit/history.', 8)
on conflict (code) do nothing;

-- Admin roles (DATABASE.md §24).
insert into public.admin_roles (code, description) values
  ('reviewer', 'Reviews AI-extracted job data; approves/rejects job_imports; moves jobs toward approved.'),
  ('editor', 'Creates/edits jobs, rules, and sources; includes reviewer capabilities.'),
  ('admin', 'Publishes/unpublishes/expires/archives jobs; manages organizations/sources/reference data; includes editor capabilities.'),
  ('super_admin', 'Grants/revokes admin roles; includes admin capabilities.')
on conflict (code) do nothing;
