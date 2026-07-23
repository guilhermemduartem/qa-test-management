-- ═══════════════════════════════════════════════════════════════════════════
-- Funções de agregação para o Assistente de IA (Gestão de Testes → Assistente)
-- ═══════════════════════════════════════════════════════════════════════════
-- Estas funções alimentam o índice do projeto e as ferramentas do chat.
-- Toda agregação de qa_test_run_results acontece aqui, no Postgres, e NUNCA no
-- modelo: a tabela crua tem uma linha por caso × execução × ciclo.
--
-- SECURITY INVOKER (padrão): a RLS do usuário se aplica. Não usar SECURITY
-- DEFINER aqui — o chat deve enxergar exatamente o que o usuário já enxerga.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Estatísticas por execução ────────────────────────────────────────────────
-- Uma linha por execução, com os resultados já contados e a taxa de aprovação.
create or replace function public.qa_chat_run_stats(p_project_id text)
returns table (
  run_id text,
  run_name text,
  run_status text,
  cycle integer,
  total bigint,
  passed bigint,
  failed bigint,
  blocked bigint,
  skipped bigint,
  untested bigint,
  pass_rate numeric
)
language sql
stable
as $$
  select
    r.id,
    r.name,
    r.status,
    r.cycle,
    count(rr.id),
    count(rr.id) filter (where rr.status = 'passed'),
    count(rr.id) filter (where rr.status = 'failed'),
    count(rr.id) filter (where rr.status = 'blocked'),
    count(rr.id) filter (where rr.status = 'skipped'),
    count(rr.id) filter (where rr.status = 'untested'),
    round(
      100.0 * count(rr.id) filter (where rr.status = 'passed')
      / nullif(count(rr.id) filter (where rr.status <> 'untested'), 0)
    , 0)
  from public.qa_test_runs r
  left join public.qa_test_run_results rr on rr.run_id = r.id
  where r.project_id = p_project_id
  group by r.id, r.name, r.status, r.cycle
  order by r.id;
$$;

-- ── Cobertura por caso ───────────────────────────────────────────────────────
-- Para cada caso: quantas vezes foi executado, o último resultado e quando.
-- Use para "quais casos nunca foram executados" (exec_count = 0).
create or replace function public.qa_chat_case_coverage(p_project_id text)
returns table (
  case_id text,
  title text,
  exec_count bigint,
  last_status text,
  last_executed_at timestamptz
)
language sql
stable
as $$
  select
    c.id,
    c.title,
    count(rr.id),
    (array_agg(rr.status order by rr.executed_at desc nulls last, rr.id desc)
       filter (where rr.id is not null))[1],
    max(rr.executed_at)
  from public.qa_test_cases c
  left join public.qa_test_run_results rr on rr.case_id = c.id
  where c.project_id = p_project_id
  group by c.id, c.title
  order by c.id;
$$;

-- ── Contagem de defeitos ─────────────────────────────────────────────────────
-- Agrupada por tipo (kind), status e severidade. Poucas linhas.
create or replace function public.qa_chat_defect_counts(p_project_id text)
returns table (
  kind text,
  status text,
  severity text,
  total bigint
)
language sql
stable
as $$
  select
    d.kind,
    d.status,
    d.severity,
    count(*)
  from public.qa_defects d
  where d.project_id = p_project_id
  group by d.kind, d.status, d.severity
  order by d.kind, d.status, d.severity;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
grant execute on function public.qa_chat_run_stats(text)      to authenticated;
grant execute on function public.qa_chat_case_coverage(text)  to authenticated;
grant execute on function public.qa_chat_defect_counts(text)  to authenticated;
