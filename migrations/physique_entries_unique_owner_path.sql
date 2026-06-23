-- Belt-and-suspenders for physique upload idempotency. photo_path is unique per
-- staged shot and reused across retries, so (created_by, photo_path) must be
-- unique. Complements the select-then-insert dedupe in the analyze-physique edge
-- function by closing the rare concurrent-double-fire race at the DB level (the
-- function catches the resulting 23505 and returns the existing row).
--
-- Applied live via MCP on 2026-06-23; recorded here for version control.
create unique index if not exists physique_entries_owner_path_key
  on public.physique_entries (created_by, photo_path);
