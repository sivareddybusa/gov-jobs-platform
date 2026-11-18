-- Phase 7: official previous-year question papers and answer keys, as LINKS.
-- Same rules as the other exam materials (Phase 4): the file stays on the official site, only the
-- service-role sync writes, and the URL must satisfy is_official_exam_url. Nothing is hosted or
-- copied, so no copyrighted paper is stored here.

alter table public.exam_materials drop constraint exam_materials_kind_check;
alter table public.exam_materials add constraint exam_materials_kind_check
  check (kind in ('notification', 'syllabus', 'sample_paper', 'guidance', 'previous_paper', 'answer_key'));

-- The exam year, only when it is stated in the document's own title or URL (never guessed).
alter table public.exam_materials
  add column paper_year smallint check (paper_year between 2000 and 2100),
  add constraint exam_materials_year_only_for_papers
    check (paper_year is null or kind in ('previous_paper', 'answer_key'));

-- Existing exams were last checked before these kinds existed: check them again.
update public.exams set materials_synced_at = null where materials_synced_at is not null;
