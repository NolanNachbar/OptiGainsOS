-- Allow test_type = 'specialization' on controlled_tests.
--
-- The specialization test (SPEC_specialization_test.md) reuses the existing
-- controlled_tests framework rather than adding a parallel one, but the original
-- CHECK constraint enumerates only the four types that existed in increment 1.
-- Without this, schedule_specialization_test's insert fails at runtime.
--
-- Additive and non-destructive: no rows change, the constraint only widens.

alter table public.controlled_tests
  drop constraint if exists controlled_tests_test_type_check;

alter table public.controlled_tests
  add constraint controlled_tests_test_type_check
  check (test_type = any (array[
    'recovery_stress',
    'volume_tolerance',
    'running_tolerance',
    'pst_diagnostic',
    'specialization'
  ]));
