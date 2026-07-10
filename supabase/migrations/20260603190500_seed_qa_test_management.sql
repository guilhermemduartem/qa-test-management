-- ═══════════════════════════════════════════════════════════════════════════
-- MASSA DE TESTES — Módulo de Gestão de Testes (qa_test_* / qa_*)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cenário realista e coeso ("Portal de Turismo MikeTec") para entender o fluxo
-- de cada aba: Projetos → Suítes → Casos → Requisitos/Rastreabilidade →
-- Milestones → Planos → Execuções (runs) → Resultados → Defeitos → Sessões
-- exploratórias.
--
-- Domínio: portal de reservas de viagens (busca de pacotes/destinos, reserva de
-- hotel e voo, pagamento e avaliações).
--
-- Idempotente: todos os INSERT usam `on conflict (id) do nothing`, então rodar a
-- migration mais de uma vez não duplica dados. Os IDs usam prefixos legíveis
-- (proj_/suite_/case_/...) para facilitar inspeção no banco e na UI.
--
-- created_by / assigned_to / executed_by referenciam os usuários semente criados
-- em 20260529220500_create_qa_users.sql: seed_admin, seed_qa, seed_leitura.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Projeto ──────────────────────────────────────────────────────────────────
insert into public.qa_test_projects (id, name, description, created_by, created_at) values
  ('proj_turismo', 'Portal de Turismo MikeTec', 'Portal de reservas de viagens: autenticação, busca de pacotes/destinos, reserva de hotel e voo, pagamento e avaliações. Massa de testes de demonstração.', 'seed_admin', '2026-05-01T09:00:00Z')
on conflict (id) do nothing;

-- ── Suítes (hierárquicas) ─────────────────────────────────────────────────────
insert into public.qa_test_suites (id, project_id, parent_id, name, "order", created_at) values
  ('suite_conta',    'proj_turismo', null,          'Conta e Autenticação',  0, '2026-05-01T09:10:00Z'),
  ('suite_login',    'proj_turismo', 'suite_conta', 'Login',                 0, '2026-05-01T09:11:00Z'),
  ('suite_cadastro', 'proj_turismo', 'suite_conta', 'Cadastro',              1, '2026-05-01T09:12:00Z'),
  ('suite_busca',    'proj_turismo', null,          'Busca de Pacotes',      1, '2026-05-01T09:13:00Z'),
  ('suite_reserva',  'proj_turismo', null,          'Reserva e Pagamento',   2, '2026-05-01T09:14:00Z'),
  ('suite_aval',     'proj_turismo', null,          'Avaliações',            3, '2026-05-01T09:15:00Z')
on conflict (id) do nothing;

-- ── Requisitos ─────────────────────────────────────────────────────────────
insert into public.qa_requirements (id, project_id, external_key, title, description, created_at) values
  ('req_auth',    'proj_turismo', 'RF-001', 'Autenticação de usuário',     'O usuário deve autenticar com login e senha válidos e receber mensagem de erro em credenciais inválidas.', '2026-05-01T08:00:00Z'),
  ('req_busca',   'proj_turismo', 'RF-010', 'Busca de pacotes turísticos', 'O portal deve permitir buscar pacotes por destino e período, com resultados em até 2 segundos.', '2026-05-01T08:05:00Z'),
  ('req_reserva', 'proj_turismo', 'RF-020', 'Reserva de pacote',           'O usuário deve reservar um pacote escolhendo datas, número de viajantes e quarto, com confirmação por e-mail.', '2026-05-01T08:10:00Z'),
  ('req_pgto',    'proj_turismo', 'RF-030', 'Pagamento da reserva',        'O checkout deve aceitar cartão de crédito e parcelamento, exibindo o voucher após a confirmação.', '2026-05-01T08:15:00Z'),
  ('req_aval',    'proj_turismo', 'RF-040', 'Avaliação de viagem',         'Após a viagem, o usuário deve poder avaliar o pacote com nota de 1 a 5 e comentário.', '2026-05-01T08:20:00Z')
on conflict (id) do nothing;

-- ── Casos de teste ─────────────────────────────────────────────────────────
insert into public.qa_test_cases
  (id, suite_id, project_id, title, type, priority, status, preconditions, steps, expected_result, tags, custom_fields, created_by, created_at, updated_at) values
  (
    'case_login_ok', 'suite_login', 'proj_turismo',
    'Login com credenciais válidas', 'manual', 'high', 'active',
    'Usuário cadastrado e ativo.',
    '[{"action":"Acessar a página de login","expected":"Formulário de login é exibido"},{"action":"Informar e-mail e senha válidos","expected":"Campos aceitam os valores"},{"action":"Clicar em Entrar","expected":"Usuário é redirecionado para a página inicial logado"}]'::jsonb,
    'Login efetuado e sessão iniciada com sucesso.',
    array['smoke','regressao','login'],
    '{"automacao":"pendente"}'::jsonb,
    'seed_qa', '2026-05-02T10:00:00Z', null
  ),
  (
    'case_login_fail', 'suite_login', 'proj_turismo',
    'Login com senha incorreta', 'manual', 'medium', 'active',
    'Usuário cadastrado e ativo.',
    '[{"action":"Acessar a página de login","expected":"Formulário de login é exibido"},{"action":"Informar e-mail válido e senha incorreta","expected":"Campos aceitam os valores"},{"action":"Clicar em Entrar","expected":"Mensagem \"Credenciais inválidas\" é exibida e usuário permanece na tela de login"}]'::jsonb,
    'Acesso negado com mensagem de erro clara, sem vazar se o e-mail existe.',
    array['negativo','login','seguranca'],
    '{}'::jsonb,
    'seed_qa', '2026-05-02T10:10:00Z', null
  ),
  (
    'case_cadastro', 'suite_cadastro', 'proj_turismo',
    'Cadastro de novo viajante', 'manual', 'high', 'active',
    'E-mail e CPF ainda não cadastrados.',
    '[{"action":"Acessar a tela de cadastro","expected":"Formulário de cadastro é exibido"},{"action":"Preencher nome, CPF, e-mail e senha forte","expected":"Validações de campo passam"},{"action":"Confirmar o cadastro","expected":"Conta criada e e-mail de confirmação enviado"}]'::jsonb,
    'Conta de viajante criada com sucesso e usuário autenticado automaticamente.',
    array['regressao','cadastro'],
    '{}'::jsonb,
    'seed_qa', '2026-05-02T10:20:00Z', '2026-05-20T14:00:00Z'
  ),
  (
    'case_busca_destino', 'suite_busca', 'proj_turismo',
    'Buscar pacotes por destino e período', 'manual', 'high', 'active',
    'Catálogo com pacotes para ao menos 5 destinos.',
    '[{"action":"Digitar \"Gramado\" no campo de destino","expected":"Sugestões de destino aparecem enquanto digita"},{"action":"Selecionar datas de ida e volta no calendário","expected":"Período é aceito (ida anterior à volta)"},{"action":"Clicar em Buscar","expected":"Lista de pacotes do destino e período é exibida em até 2s"}]'::jsonb,
    'São exibidos apenas pacotes do destino e dentro do período informado.',
    array['smoke','busca','performance'],
    '{}'::jsonb,
    'seed_qa', '2026-05-03T11:00:00Z', null
  ),
  (
    'case_api_destinos', 'suite_busca', 'proj_turismo',
    'API — GET /api/destinos retorna catálogo', 'api', 'medium', 'active',
    'API disponível e token de leitura válido.',
    '[{"action":"Enviar GET /api/destinos com header Authorization","expected":"HTTP 200"},{"action":"Validar corpo da resposta","expected":"JSON com array de destinos, cada um com id, nome, pais e precoMedio"}]'::jsonb,
    'Resposta 200 com schema válido e tempo < 500ms.',
    array['api','busca'],
    '{"endpoint":"/api/destinos","metodo":"GET"}'::jsonb,
    'seed_admin', '2026-05-03T11:30:00Z', null
  ),
  (
    'case_reserva_pacote', 'suite_reserva', 'proj_turismo',
    'Reservar pacote com datas e viajantes', 'manual', 'high', 'active',
    'Usuário autenticado e pacote disponível para o período.',
    '[{"action":"Abrir a página de um pacote disponível","expected":"Detalhes do pacote e botão \"Reservar\" habilitado"},{"action":"Informar datas, 2 adultos e 1 criança","expected":"Preço total recalculado conforme ocupação"},{"action":"Confirmar a reserva","expected":"Reserva criada com status \"Aguardando pagamento\""}]'::jsonb,
    'Reserva registrada com os viajantes e período corretos, pendente de pagamento.',
    array['smoke','reserva'],
    '{}'::jsonb,
    'seed_qa', '2026-05-03T12:00:00Z', null
  ),
  (
    'case_pagamento_cartao', 'suite_reserva', 'proj_turismo',
    'Pagar reserva com cartão de crédito', 'manual', 'critical', 'active',
    'Reserva pendente de pagamento e cartão de teste válido.',
    '[{"action":"Acessar o checkout da reserva pendente","expected":"Resumo da reserva e valor total exibidos"},{"action":"Selecionar cartão de crédito em 3x e informar dados de teste","expected":"Formulário valida número, validade e CVV"},{"action":"Confirmar o pagamento","expected":"Pagamento aprovado e voucher da viagem exibido"}]'::jsonb,
    'Pagamento aprovado, reserva confirmada e voucher disponível para download.',
    array['critico','pagamento','reserva'],
    '{}'::jsonb,
    'seed_admin', '2026-05-03T12:30:00Z', null
  ),
  (
    'case_avaliacao', 'suite_aval', 'proj_turismo',
    'Avaliar pacote após a viagem', 'manual', 'medium', 'active',
    'Usuário com viagem concluída e ainda não avaliada.',
    '[{"action":"Acessar \"Minhas viagens\" e abrir uma viagem concluída","expected":"Botão \"Avaliar\" disponível"},{"action":"Selecionar nota 5 e escrever um comentário","expected":"Campos aceitam nota (1 a 5) e texto"},{"action":"Enviar a avaliação","expected":"Avaliação publicada e visível na página do pacote"}]'::jsonb,
    'Avaliação registrada com nota e comentário, visível para outros usuários.',
    array['regressao','avaliacao'],
    '{}'::jsonb,
    'seed_qa', '2026-05-03T13:00:00Z', null
  ),
  (
    'case_filtro_preco', 'suite_busca', 'proj_turismo',
    'Filtrar pacotes por faixa de preço', 'manual', 'medium', 'draft',
    'Resultado de busca com vários pacotes.',
    '[{"action":"Aplicar o filtro de preço entre R$ 2.000 e R$ 4.000","expected":"Filtro é aplicado"},{"action":"Verificar a lista","expected":"Apenas pacotes dentro da faixa permanecem visíveis"}]'::jsonb,
    'A lista mostra somente pacotes dentro da faixa de preço selecionada.',
    array['busca','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-05-04T09:00:00Z', null
  )
on conflict (id) do nothing;

-- ── Rastreabilidade caso ↔ requisito ─────────────────────────────────────────
insert into public.qa_test_case_requirements (case_id, requirement_id) values
  ('case_login_ok',        'req_auth'),
  ('case_login_fail',      'req_auth'),
  ('case_cadastro',        'req_auth'),
  ('case_busca_destino',   'req_busca'),
  ('case_api_destinos',    'req_busca'),
  ('case_filtro_preco',    'req_busca'),
  ('case_reserva_pacote',  'req_reserva'),
  ('case_pagamento_cartao','req_pgto'),
  ('case_avaliacao',       'req_aval')
on conflict (case_id, requirement_id) do nothing;

-- ── Histórico de versões de caso (exemplo: case_cadastro foi editado) ────────
insert into public.qa_test_case_versions (id, case_id, snapshot, saved_by, saved_at) values
  (
    'ver_cadastro_v1', 'case_cadastro',
    '{"title":"Cadastro de novo viajante","priority":"medium","status":"draft","expectedResult":"Conta criada com sucesso."}'::jsonb,
    'seed_qa', '2026-05-02T10:20:00Z'
  )
on conflict (id) do nothing;

-- ── Milestones ───────────────────────────────────────────────────────────────
insert into public.qa_milestones (id, project_id, name, due_date, status, created_at) values
  ('ms_verao_27',  'proj_turismo', 'Temporada Verão 2026/2027', '2026-12-01T00:00:00Z', 'open',      '2026-05-05T08:00:00Z'),
  ('ms_lancamento','proj_turismo', 'Lançamento do Portal',      '2026-04-30T00:00:00Z', 'completed', '2026-03-01T08:00:00Z')
on conflict (id) do nothing;

-- ── Planos de teste ──────────────────────────────────────────────────────────
insert into public.qa_test_plans (id, project_id, milestone_id, name, scope, created_by, created_at) values
  ('plan_reg_verao', 'proj_turismo', 'ms_verao_27', 'Plano de Regressão — Temporada de Verão', 'Cobertura completa de conta, busca, reserva, pagamento e avaliações antes do pico de vendas do verão.', 'seed_admin', '2026-05-06T09:00:00Z'),
  ('plan_smoke',     'proj_turismo', null,          'Smoke Test diário',                       'Fluxos críticos: login, buscar pacote, reservar e pagar.', 'seed_qa', '2026-05-06T09:30:00Z')
on conflict (id) do nothing;

-- ── Execuções (runs) ─────────────────────────────────────────────────────────
insert into public.qa_test_runs (id, project_id, plan_id, name, status, assigned_to, created_at, closed_at) values
  ('run_sprint12', 'proj_turismo', 'plan_reg_verao', 'Regressão — Sprint 12', 'in_progress', 'seed_qa',    '2026-05-25T09:00:00Z', null),
  ('run_smoke_05', 'proj_turismo', 'plan_smoke',     'Smoke 2026-05-30',       'closed',      'seed_admin', '2026-05-30T08:00:00Z', '2026-05-30T08:45:00Z')
on conflict (id) do nothing;

-- ── Resultados das execuções ─────────────────────────────────────────────────
-- Run de regressão (em andamento): mistura de passou/falhou/bloqueado/não testado.
insert into public.qa_test_run_results
  (id, run_id, case_id, status, executed_by, executed_at, elapsed_seconds, comment, evidence) values
  ('res_r12_login_ok',  'run_sprint12', 'case_login_ok',        'passed',   'seed_qa', '2026-05-25T09:10:00Z', 95,  'Login OK em Chrome e Firefox.', '[]'::jsonb),
  ('res_r12_login_fail','run_sprint12', 'case_login_fail',      'passed',   'seed_qa', '2026-05-25T09:15:00Z', 60,  'Mensagem de erro genérica, sem vazar existência do e-mail.', '[]'::jsonb),
  ('res_r12_cadastro',  'run_sprint12', 'case_cadastro',        'passed',   'seed_qa', '2026-05-25T09:25:00Z', 180, 'E-mail de confirmação chegou em ~3s.', '[]'::jsonb),
  ('res_r12_busca',     'run_sprint12', 'case_busca_destino',   'failed',   'seed_qa', '2026-05-25T10:00:00Z', 140, 'Busca por "Gramado" demorou 4,2s — acima do limite de 2s.', '[{"name":"print-busca-lenta.png","url":"https://exemplo.local/evidencias/print-busca-lenta.png"}]'::jsonb),
  ('res_r12_reserva',   'run_sprint12', 'case_reserva_pacote',  'passed',   'seed_qa', '2026-05-25T10:20:00Z', 110, 'Preço recalculado corretamente para 2 adultos + 1 criança.', '[]'::jsonb),
  ('res_r12_pagamento', 'run_sprint12', 'case_pagamento_cartao','blocked',  'seed_qa', '2026-05-25T10:40:00Z', 30,  'Gateway de pagamento de homologação fora do ar.', '[]'::jsonb),
  ('res_r12_aval',      'run_sprint12', 'case_avaliacao',       'retest',   'seed_qa', '2026-05-25T11:00:00Z', 70,  'Avaliação salva, mas não aparece na hora — reteste após correção.', '[]'::jsonb),
  ('res_r12_api',       'run_sprint12', 'case_api_destinos',    'untested', null,      null,                   0,   '', '[]'::jsonb),
  -- Smoke (fechada): tudo passou.
  ('res_sm_login_ok',   'run_smoke_05', 'case_login_ok',        'passed',   'seed_admin', '2026-05-30T08:05:00Z', 50,  'OK.', '[]'::jsonb),
  ('res_sm_busca',      'run_smoke_05', 'case_busca_destino',   'passed',   'seed_admin', '2026-05-30T08:15:00Z', 80,  'Busca rápida no ambiente de smoke.', '[]'::jsonb),
  ('res_sm_reserva',    'run_smoke_05', 'case_reserva_pacote',  'passed',   'seed_admin', '2026-05-30T08:25:00Z', 95,  'Reserva criada OK.', '[]'::jsonb),
  ('res_sm_pagamento',  'run_smoke_05', 'case_pagamento_cartao','passed',   'seed_admin', '2026-05-30T08:40:00Z', 210, 'Pagamento aprovado com cartão de teste em 3x.', '[]'::jsonb)
on conflict (id) do nothing;

-- ── Defeitos ─────────────────────────────────────────────────────────────────
-- Defeitos ligados aos resultados que falharam / ficaram bloqueados / em reteste.
insert into public.qa_defects
  (id, project_id, run_result_id, title, description, severity, status, external_key, created_by, created_at) values
  ('def_busca_lenta',  'proj_turismo', 'res_r12_busca',     'Busca de pacotes acima de 2s',        'A busca por "Gramado" retornou em 4,2s, violando o RF-010 (< 2s). Suspeita de falta de índice na coluna destino.', 'high',   'open',        'BUG-2042', 'seed_qa', '2026-05-25T10:05:00Z'),
  ('def_gateway',      'proj_turismo', 'res_r12_pagamento', 'Gateway de homologação instável',     'Ambiente de pagamento de homologação fica indisponível de forma intermitente, bloqueando o teste de pagamento.', 'medium', 'in_progress', 'BUG-2043', 'seed_qa', '2026-05-25T10:45:00Z'),
  ('def_aval_atraso',  'proj_turismo', 'res_r12_aval',      'Avaliação não aparece imediatamente', 'A avaliação é salva, mas só aparece na página do pacote após recarregar — falta atualizar a lista em tempo real.', 'low',    'resolved',    'BUG-2044', 'seed_qa', '2026-05-25T11:05:00Z')
on conflict (id) do nothing;

-- ── Sessões exploratórias ────────────────────────────────────────────────────
insert into public.qa_exploratory_sessions
  (id, project_id, charter, notes, duration_seconds, created_by, created_at) values
  (
    'sess_reserva', 'proj_turismo',
    'Explorar o fluxo de reserva e pagamento em busca de problemas de usabilidade e validação do formulário de cartão.',
    '[{"at":"2026-05-28T14:05:00Z","text":"Campo de CVV aceita mais de 4 dígitos."},{"at":"2026-05-28T14:18:00Z","text":"Sem feedback de carregamento ao confirmar o pagamento."},{"at":"2026-05-28T14:30:00Z","text":"Botão Confirmar reserva pode ser clicado duas vezes — risco de reserva duplicada."}]'::jsonb,
    1800, 'seed_qa', '2026-05-28T14:00:00Z'
  )
on conflict (id) do nothing;