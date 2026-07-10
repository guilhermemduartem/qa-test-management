-- ═══════════════════════════════════════════════════════════════════════════
-- Séries / ciclos de execução
-- ═══════════════════════════════════════════════════════════════════════════
-- Uma execução pode ser re-testada, criando um NOVO ciclo (nova linha em
-- qa_test_runs) que compartilha o mesmo `series_id`. `cycle` numera os ciclos
-- dentro da série (1, 2, 3…). Regra de negócio (na app): só pode haver um ciclo
-- em andamento por série.
--
-- Backfill: cada execução existente vira sua própria série (series_id = id),
-- ciclo 1.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.qa_test_runs add column if not exists series_id text;
alter table public.qa_test_runs add column if not exists cycle integer not null default 1;

update public.qa_test_runs set series_id = id where series_id is null;

create index if not exists idx_qa_test_runs_series on public.qa_test_runs(series_id);
