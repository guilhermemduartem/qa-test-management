-- ═══════════════════════════════════════════════════════════════════════════
-- MASSA DE TESTES — Projeto TalentTrack (Miketec_QA_TalentTrack)
-- ═══════════════════════════════════════════════════════════════════════════
-- Casos de teste AUTOMATIZADOS do Backoffice TalentTrack: Login, Usuários,
-- Configurações (Pilares/Produtos/Clientes/Squads/Tipos de Atividade/Ações),
-- Referências, Minhas Referências, User Stories, Minhas User Stories,
-- Lançamentos e Auditoria.
--
-- REBUILD: como uma versão anterior deste seed já pode ter sido aplicada,
-- a migration primeiro APAGA todos os casos e suítes do projeto e então
-- reinsere o conjunto correto (sem Auth Setup, type=automated, sem prefixo
-- "TCxx" nos títulos). Seguro: não há runs/requisitos ligados a este projeto.
-- Rodar mais de uma vez sempre converge para o mesmo estado.
--
-- IDs com prefixo proj_tt / suite_tt_ / case_tt_ para inspeção fácil.
-- created_by referencia os usuários semente (seed_admin, seed_qa).
-- GERADO por scripts/gen-talenttrack-seed.mjs — não editar à mão.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Projeto ──────────────────────────────────────────────────────────────────
insert into public.qa_test_projects (id, name, description, created_by, created_at) values
  ('proj_talenttrack', 'TalentTrack', 'Backoffice TalentTrack (Miketec_QA_TalentTrack): autenticação, gestão de usuários, configurações de entidades, referências, user stories, lançamentos de horas e auditoria. Casos de teste automatizados.', 'seed_admin', '2026-06-04T09:00:00Z')
on conflict (id) do nothing;

-- ── Rebuild: limpa o estado antigo do projeto (casos antes das suítes p/ FK) ──
delete from public.qa_test_cases  where project_id = 'proj_talenttrack';
delete from public.qa_test_suites where project_id = 'proj_talenttrack';

-- ── Suítes (hierárquicas) ─────────────────────────────────────────────────────
insert into public.qa_test_suites (id, project_id, parent_id, name, "order", created_at) values
  ('suite_tt_login', 'proj_talenttrack', null, 'Login', 0, '2026-06-04T09:00:00Z'),
  ('suite_tt_usuarios', 'proj_talenttrack', null, 'Usuários', 1, '2026-06-04T09:00:00Z'),
  ('suite_tt_config', 'proj_talenttrack', null, 'Configurações', 2, '2026-06-04T09:00:00Z'),
  ('suite_tt_pilares', 'proj_talenttrack', 'suite_tt_config', 'Pilares', 3, '2026-06-04T09:00:00Z'),
  ('suite_tt_produtos', 'proj_talenttrack', 'suite_tt_config', 'Produtos', 4, '2026-06-04T09:00:00Z'),
  ('suite_tt_clientes', 'proj_talenttrack', 'suite_tt_config', 'Clientes', 5, '2026-06-04T09:00:00Z'),
  ('suite_tt_squads', 'proj_talenttrack', 'suite_tt_config', 'Squads', 6, '2026-06-04T09:00:00Z'),
  ('suite_tt_tipos', 'proj_talenttrack', 'suite_tt_config', 'Tipos de Atividade', 7, '2026-06-04T09:00:00Z'),
  ('suite_tt_acoes', 'proj_talenttrack', 'suite_tt_config', 'Ações', 8, '2026-06-04T09:00:00Z'),
  ('suite_tt_ref', 'proj_talenttrack', null, 'Referências', 9, '2026-06-04T09:00:00Z'),
  ('suite_tt_minhasref', 'proj_talenttrack', null, 'Minhas Referências', 10, '2026-06-04T09:00:00Z'),
  ('suite_tt_us', 'proj_talenttrack', null, 'User Stories', 11, '2026-06-04T09:00:00Z'),
  ('suite_tt_minhasus', 'proj_talenttrack', null, 'Minhas User Stories', 12, '2026-06-04T09:00:00Z'),
  ('suite_tt_lanc', 'proj_talenttrack', null, 'Lançamentos', 13, '2026-06-04T09:00:00Z'),
  ('suite_tt_auditoria', 'proj_talenttrack', null, 'Auditoria', 14, '2026-06-04T09:00:00Z')
on conflict (id) do nothing;

-- ── Casos de teste ─────────────────────────────────────────────────────────
insert into public.qa_test_cases
  (id, suite_id, project_id, title, type, priority, status, preconditions, steps, expected_result, tags, custom_fields, created_by, created_at, updated_at) values
  (
    'case_tt_001', 'suite_tt_login', 'proj_talenttrack',
    'Login com credenciais válidas', 'automated', 'high', 'active',
    'A página de login está disponível. Credenciais válidas configuradas em CREDENTIALS.',
    '[{"action":"Acessar a página de login","expected":"A página de login é exibida"},{"action":"Informar e-mail e senha válidos","expected":"Os campos são preenchidos corretamente"},{"action":"Submeter o formulário","expected":"O login é enviado"},{"action":"Aguardar o welcome message","expected":"A mensagem \"Seja bem-vindo\" aparece"}]'::jsonb,
    'O sistema apresenta a mensagem "Seja bem-vindo". Login concluído com sucesso.',
    array['login','autenticacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_002', 'suite_tt_login', 'proj_talenttrack',
    'Login com senha incorreta', 'automated', 'medium', 'active',
    'A página de login está disponível. O e-mail utilizado é válido.',
    '[{"action":"Acessar a página de login","expected":"A página de login é exibida"},{"action":"Informar e-mail válido e senha errada","expected":"Os dados são inseridos"},{"action":"Tentar fazer login","expected":"O sistema retorna erro de credenciais"}]'::jsonb,
    'É exibida a mensagem de erro "E-mail ou senha incorreto".',
    array['login','erro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_003', 'suite_tt_login', 'proj_talenttrack',
    'Login com e-mail não cadastrado', 'automated', 'medium', 'active',
    'A página de login está disponível.',
    '[{"action":"Acessar a página de login","expected":"A página de login é exibida"},{"action":"Informar e-mail não cadastrado e senha válida","expected":"Os dados são inseridos"},{"action":"Tentar fazer login","expected":"O sistema retorna erro de usuário inexistente"}]'::jsonb,
    'É exibida a mensagem de erro "E-mail ou senha incorreto".',
    array['login','erro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_004', 'suite_tt_login', 'proj_talenttrack',
    'Login com campos vazios', 'automated', 'medium', 'active',
    'A página de login está disponível.',
    '[{"action":"Acessar a página de login","expected":"A página de login é exibida"},{"action":"Deixar e-mail e senha em branco","expected":"Os campos permanecem vazios"},{"action":"Clicar em entrar","expected":"A validação de campo é disparada"}]'::jsonb,
    'O campo de e-mail exibe mensagem de validação "Preencha este campo".',
    array['login','validacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_005', 'suite_tt_login', 'proj_talenttrack',
    'Login apenas com e-mail (sem senha)', 'automated', 'medium', 'active',
    'A página de login está disponível.',
    '[{"action":"Acessar a página de login","expected":"A página de login é exibida"},{"action":"Informar e-mail válido e deixar a senha em branco","expected":"O e-mail é preenchido e a senha fica vazia"},{"action":"Clicar em entrar","expected":"O sistema exibe erro de campo obrigatório"}]'::jsonb,
    'O campo de senha exibe mensagem de validação "Preencha este campo".',
    array['login','validacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_006', 'suite_tt_login', 'proj_talenttrack',
    'Login apenas com senha (sem e-mail)', 'automated', 'medium', 'active',
    'A página de login está disponível.',
    '[{"action":"Acessar a página de login","expected":"A página de login é exibida"},{"action":"Informar senha válida e deixar o e-mail em branco","expected":"A senha é preenchida e o e-mail fica vazio"},{"action":"Clicar em entrar","expected":"O sistema exibe erro de campo obrigatório"}]'::jsonb,
    'O campo de e-mail exibe mensagem de validação "Preencha este campo".',
    array['login','validacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_007', 'suite_tt_login', 'proj_talenttrack',
    'Login com formato de e-mail inválido', 'automated', 'medium', 'active',
    'A página de login está disponível.',
    '[{"action":"Acessar a página de login","expected":"A página de login é exibida"},{"action":"Informar um e-mail sem @ e senha válida","expected":"O e-mail é inserido em formato inválido"},{"action":"Clicar em entrar","expected":"A validação do e-mail é acionada"}]'::jsonb,
    'O campo de e-mail exibe mensagem de validação informando que o @ está faltando.',
    array['login','validacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_008', 'suite_tt_usuarios', 'proj_talenttrack',
    'Criar usuário Regular', 'automated', 'high', 'active',
    'Usuário autenticado no Backoffice. Acesso à tela de usuários.',
    '[{"action":"Navegar para a tela de Usuários","expected":"A tela de usuários é exibida"},{"action":"Clicar em \"Adicionar\"","expected":"O formulário de cadastro é aberto"},{"action":"Preencher o formulário completo com dados pessoais, identificação, profissional e segurança","expected":"Todos os campos são preenchidos"},{"action":"Salvar o usuário","expected":"O cadastro é enviado"},{"action":"Filtrar por e-mail criado","expected":"O usuário aparece na listagem"}]'::jsonb,
    'O usuário aparece na listagem. O sistema permite excluir o usuário criado.',
    array['usuarios','cadastro'],
    '{}'::jsonb,
    'seed_admin', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_009', 'suite_tt_usuarios', 'proj_talenttrack',
    'Criar usuário Admin', 'automated', 'high', 'active',
    'Usuário autenticado no Backoffice. Acesso à tela de usuários.',
    '[{"action":"Navegar para a tela de Usuários","expected":"A tela de usuários é exibida"},{"action":"Clicar em \"Adicionar\"","expected":"O formulário de cadastro é aberto"},{"action":"Preencher o formulário com tipo de conta Admin","expected":"O tipo Admin é selecionado"},{"action":"Salvar o usuário","expected":"O cadastro é enviado"},{"action":"Filtrar por username ou e-mail","expected":"O usuário Admin aparece na listagem"}]'::jsonb,
    'O usuário Admin é criado com sucesso. O usuário aparece na listagem. O sistema permite excluir o usuário criado.',
    array['usuarios','cadastro'],
    '{}'::jsonb,
    'seed_admin', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_010', 'suite_tt_usuarios', 'proj_talenttrack',
    'Editar usuário', 'automated', 'high', 'active',
    'Usuário autenticado no Backoffice. Acesso à tela de usuários.',
    '[{"action":"Criar um usuário de teste","expected":"O usuário de teste é criado"},{"action":"Filtrar por e-mail","expected":"O usuário é localizado"},{"action":"Editar os dados do usuário (nome, telefone, cargo, descrição, senha)","expected":"Os campos são alterados"},{"action":"Salvar a alteração","expected":"A atualização é enviada"},{"action":"Filtrar novamente e validar a edição","expected":"O registro atualizado aparece"}]'::jsonb,
    'O toast de atualização aparece. O usuário editado é exibido na listagem. O usuário pode ser excluído com sucesso.',
    array['usuarios','edicao'],
    '{}'::jsonb,
    'seed_admin', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_011', 'suite_tt_pilares', 'proj_talenttrack',
    'Listar Pilares', 'automated', 'medium', 'active',
    'Usuário autenticado no Backoffice. Acesso à tela de Pilares.',
    '[{"action":"Navegar até Pilares","expected":"A tela de Pilares é exibida"},{"action":"Verificar que a listagem é carregada","expected":"A listagem contém itens"},{"action":"Confirmar presença do botão de adicionar","expected":"O botão está visível"}]'::jsonb,
    'A listagem está visível. O botão de adicionar está disponível.',
    array['configuracoes','listagem'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_012', 'suite_tt_pilares', 'proj_talenttrack',
    'Criar novo Pilar', 'automated', 'high', 'active',
    'Usuário autenticado. Acesso à tela de Pilares.',
    '[{"action":"Criar um novo pilar com dados válidos","expected":"O formulário é preenchido"},{"action":"Confirmar toast de criação","expected":"A mensagem de sucesso aparece"},{"action":"Validar que o pilar aparece na lista","expected":"O registro aparece"},{"action":"Excluir o pilar","expected":"A exclusão é confirmada"}]'::jsonb,
    'Pilar criado com sucesso. Pilar aparece na listagem. Exclusão é permitida.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_013', 'suite_tt_pilares', 'proj_talenttrack',
    'Editar Pilar', 'automated', 'high', 'active',
    'Pilar existente criado para o teste.',
    '[{"action":"Criar um pilar de teste","expected":"O pilar é criado"},{"action":"Editar o pilar criado","expected":"As alterações são aplicadas"},{"action":"Confirmar toast de edição","expected":"A mensagem de sucesso aparece"},{"action":"Validar que o pilar editado aparece na lista","expected":"O registro atualizado aparece"},{"action":"Excluir o pilar","expected":"A exclusão é confirmada"}]'::jsonb,
    'Alterações salvas com sucesso. O pilar editado aparece na listagem.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_014', 'suite_tt_pilares', 'proj_talenttrack',
    'Excluir Pilar', 'automated', 'medium', 'active',
    'Pilar existente criado para o teste.',
    '[{"action":"Criar um pilar","expected":"O pilar é criado"},{"action":"Excluir o pilar","expected":"A exclusão é solicitada"},{"action":"Confirmar toast de exclusão","expected":"A mensagem aparece"},{"action":"Validar que o pilar foi removido","expected":"O registro não existe mais"}]'::jsonb,
    'Pilar excluído com sucesso. O pilar não aparece mais na lista.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_015', 'suite_tt_produtos', 'proj_talenttrack',
    'Criar novo Produto', 'automated', 'medium', 'active',
    'Usuário autenticado. Acesso à tela de Produtos.',
    '[{"action":"Criar um novo produto com dados válidos","expected":"O formulário é preenchido"},{"action":"Confirmar toast de criação","expected":"A mensagem de sucesso aparece"},{"action":"Validar que o produto aparece na listagem","expected":"O produto é listado"},{"action":"Excluir o produto","expected":"A exclusão é confirmada"}]'::jsonb,
    'Produto criado com sucesso. Produto removido com sucesso.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_016', 'suite_tt_produtos', 'proj_talenttrack',
    'Editar Produto', 'automated', 'medium', 'active',
    'Produto de teste criado.',
    '[{"action":"Criar produto de teste","expected":"O produto é criado"},{"action":"Editar o produto","expected":"As alterações são aplicadas"},{"action":"Confirmar toast de edição","expected":"A mensagem de sucesso aparece"},{"action":"Validar que o produto com novo nome aparece na lista","expected":"O produto atualizado aparece"},{"action":"Excluir o produto","expected":"A exclusão é confirmada"}]'::jsonb,
    'Produto atualizado com sucesso. Alterações aparecem na listagem.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_017', 'suite_tt_produtos', 'proj_talenttrack',
    'Excluir Produto', 'automated', 'medium', 'active',
    'Produto de teste criado.',
    '[{"action":"Criar produto de teste","expected":"O produto é criado"},{"action":"Excluir o produto","expected":"A exclusão é solicitada"},{"action":"Confirmar toast de exclusão","expected":"A mensagem aparece"},{"action":"Validar que o produto desapareceu da lista","expected":"O registro não existe mais"}]'::jsonb,
    'Produto excluído com sucesso.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_018', 'suite_tt_clientes', 'proj_talenttrack',
    'Criar novo Cliente', 'automated', 'medium', 'active',
    'Usuário autenticado. Acesso à tela de Clientes.',
    '[{"action":"Criar um cliente válido","expected":"O formulário é preenchido"},{"action":"Confirmar toast de criação","expected":"A mensagem de sucesso aparece"},{"action":"Validar presença do cliente na lista","expected":"O cliente é listado"},{"action":"Excluir o cliente","expected":"A exclusão é confirmada"}]'::jsonb,
    'Cliente criado e removido com sucesso.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_019', 'suite_tt_clientes', 'proj_talenttrack',
    'Editar Cliente', 'automated', 'medium', 'active',
    'Cliente de teste criado.',
    '[{"action":"Criar cliente de teste","expected":"O cliente é criado"},{"action":"Editar o cliente","expected":"As alterações são aplicadas"},{"action":"Confirmar toast de edição","expected":"A mensagem de sucesso aparece"},{"action":"Validar que o cliente editado aparece na lista","expected":"O registro atualizado aparece"}]'::jsonb,
    'Cliente atualizado com sucesso.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_020', 'suite_tt_clientes', 'proj_talenttrack',
    'Excluir Cliente', 'automated', 'medium', 'active',
    'Cliente de teste criado.',
    '[{"action":"Criar cliente de teste","expected":"O cliente é criado"},{"action":"Excluir o cliente","expected":"A exclusão é solicitada"},{"action":"Confirmar toast de exclusão","expected":"A mensagem aparece"},{"action":"Validar que o cliente não aparece mais","expected":"O registro não existe mais"}]'::jsonb,
    'Cliente excluído com sucesso.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_021', 'suite_tt_squads', 'proj_talenttrack',
    'Criar novo Squad', 'automated', 'medium', 'active',
    'Usuário autenticado. Acesso à tela de Squads.',
    '[{"action":"Criar um squad válido","expected":"O formulário é preenchido"},{"action":"Confirmar toast de criação","expected":"A mensagem de sucesso aparece"},{"action":"Validar que o squad aparece na lista","expected":"O registro aparece"},{"action":"Excluir o squad","expected":"A exclusão é confirmada"}]'::jsonb,
    'Squad criado e removido com sucesso.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_022', 'suite_tt_squads', 'proj_talenttrack',
    'Editar Squad', 'automated', 'medium', 'active',
    'Squad de teste criado.',
    '[{"action":"Criar squad de teste","expected":"O squad é criado"},{"action":"Editar o squad","expected":"As alterações são aplicadas"},{"action":"Confirmar toast de edição","expected":"A mensagem de sucesso aparece"},{"action":"Validar a alteração na listagem","expected":"O squad atualizado aparece"}]'::jsonb,
    'Squad atualizado com sucesso.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_023', 'suite_tt_squads', 'proj_talenttrack',
    'Excluir Squad', 'automated', 'medium', 'active',
    'Squad de teste criado.',
    '[{"action":"Criar squad de teste","expected":"O squad é criado"},{"action":"Excluir o squad","expected":"A exclusão é solicitada"},{"action":"Validar remoção da listagem","expected":"O registro não existe mais"}]'::jsonb,
    'Squad excluído com sucesso.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_024', 'suite_tt_tipos', 'proj_talenttrack',
    'Criar novo Tipo de Atividade', 'automated', 'medium', 'active',
    'Usuário autenticado. Acesso à tela de Tipos de Atividade.',
    '[{"action":"Criar um tipo de atividade válido","expected":"O formulário é preenchido"},{"action":"Confirmar toast de criação","expected":"A mensagem de sucesso aparece"},{"action":"Validar presença do tipo na lista","expected":"O registro aparece"},{"action":"Excluir o tipo","expected":"A exclusão é confirmada"}]'::jsonb,
    'Tipo de atividade criado e removido com sucesso.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_025', 'suite_tt_tipos', 'proj_talenttrack',
    'Editar Tipo de Atividade', 'automated', 'medium', 'active',
    'Tipo de atividade de teste criado.',
    '[{"action":"Criar tipo de atividade","expected":"O tipo é criado"},{"action":"Editar o tipo","expected":"As alterações são aplicadas"},{"action":"Confirmar toast de edição","expected":"A mensagem de sucesso aparece"},{"action":"Validar a alteração na lista","expected":"O registro atualizado aparece"}]'::jsonb,
    'Tipo de atividade atualizado com sucesso.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_026', 'suite_tt_tipos', 'proj_talenttrack',
    'Excluir Tipo de Atividade', 'automated', 'medium', 'active',
    'Tipo de atividade de teste criado.',
    '[{"action":"Criar tipo de atividade","expected":"O tipo é criado"},{"action":"Excluir o tipo","expected":"A exclusão é solicitada"},{"action":"Confirmar remoção","expected":"A mensagem de exclusão aparece"}]'::jsonb,
    'Tipo excluído com sucesso.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_027', 'suite_tt_acoes', 'proj_talenttrack',
    'Criar nova Ação', 'automated', 'medium', 'active',
    'Usuário autenticado. Acesso à tela de Ações.',
    '[{"action":"Criar ação com dados válidos","expected":"O formulário é preenchido"},{"action":"Confirmar toast de criação","expected":"A mensagem de sucesso aparece"},{"action":"Validar que a ação aparece na listagem","expected":"O registro aparece"},{"action":"Excluir a ação","expected":"A exclusão é confirmada"}]'::jsonb,
    'Ação criada e removida com sucesso.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_028', 'suite_tt_acoes', 'proj_talenttrack',
    'Editar Ação', 'automated', 'medium', 'active',
    'Ação de teste criada.',
    '[{"action":"Criar uma ação","expected":"A ação é criada"},{"action":"Editar a ação","expected":"As alterações são aplicadas"},{"action":"Confirmar toast de edição","expected":"A mensagem de sucesso aparece"},{"action":"Validar a alteração na lista","expected":"O registro atualizado aparece"}]'::jsonb,
    'Ação atualizada com sucesso.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_029', 'suite_tt_acoes', 'proj_talenttrack',
    'Excluir Ação', 'automated', 'medium', 'active',
    'Ação de teste criada.',
    '[{"action":"Criar uma ação","expected":"A ação é criada"},{"action":"Excluir a ação","expected":"A exclusão é solicitada"},{"action":"Confirmar remoção","expected":"A mensagem de exclusão aparece"}]'::jsonb,
    'Ação excluída com sucesso.',
    array['configuracoes','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_030', 'suite_tt_ref', 'proj_talenttrack',
    'Criar nova Referência', 'automated', 'medium', 'active',
    'Usuário autenticado. Acesso à página de Referências.',
    '[{"action":"Clicar em adicionar nova referência","expected":"O formulário é aberto"},{"action":"Preencher o formulário com dados válidos","expected":"Os campos são preenchidos"},{"action":"Salvar a referência","expected":"O cadastro é enviado"},{"action":"Validar toast de sucesso","expected":"A mensagem aparece"}]'::jsonb,
    'Referência criada com sucesso. Referência aparece na listagem.',
    array['referencias','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_031', 'suite_tt_ref', 'proj_talenttrack',
    'Visualizar Referência (via modal de edição)', 'automated', 'medium', 'active',
    'Referência criada no teste.',
    '[{"action":"Criar um registro de referência","expected":"O registro é criado"},{"action":"Abrir o modal de edição da referência","expected":"O modal é aberto"},{"action":"Verificar que os dados exibidos correspondem ao título criado","expected":"Os dados estão corretos"}]'::jsonb,
    'O modal abre com os dados corretos.',
    array['referencias','visualizacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_032', 'suite_tt_ref', 'proj_talenttrack',
    'Editar Referência', 'automated', 'medium', 'active',
    'Referência criada.',
    '[{"action":"Criar referência de teste","expected":"O registro é criado"},{"action":"Editar a descrição/título conforme o fluxo","expected":"Os dados são alterados"},{"action":"Salvar e validar toast de atualização","expected":"A mensagem aparece"},{"action":"Verificar que a referência ainda existe na lista","expected":"O registro permanece"}]'::jsonb,
    'Referência atualizada com sucesso. Registro permanece visível após edição.',
    array['referencias','edicao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_033', 'suite_tt_ref', 'proj_talenttrack',
    'Excluir Referência', 'automated', 'medium', 'active',
    'Referência criada.',
    '[{"action":"Criar referência de teste","expected":"O registro é criado"},{"action":"Excluir a referência","expected":"A exclusão é solicitada"},{"action":"Validar toast de exclusão","expected":"A mensagem aparece"},{"action":"Confirmar remoção da lista","expected":"O registro não aparece mais"}]'::jsonb,
    'Referência excluída com sucesso. Registro não aparece mais.',
    array['referencias','exclusao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_034', 'suite_tt_ref', 'proj_talenttrack',
    'Criar Referência duplicada exibe mensagem de erro', 'automated', 'medium', 'active',
    'Uma referência existente com o mesmo título.',
    '[{"action":"Criar referência inicial","expected":"O registro é criado"},{"action":"Tentar criar nova referência com mesmo título","expected":"O sistema tenta salvar duplicado"},{"action":"Validar mensagem de erro de duplicidade","expected":"O erro é exibido"}]'::jsonb,
    'O sistema impede a duplicação. Mensagem de erro informa que já existe uma referência com este nome.',
    array['referencias','validacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_035', 'suite_tt_ref', 'proj_talenttrack',
    'Criar Referência vinculada a nova US e excluir ambas', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Criar uma nova User Story","expected":"A User Story é criada"},{"action":"Adicionar uma referência vinculada a essa User Story","expected":"A referência é vinculada"},{"action":"Validar que a referência aparece em Minhas Referências","expected":"O registro aparece"},{"action":"Excluir a referência","expected":"A exclusão é confirmada"},{"action":"Excluir a User Story","expected":"A exclusão é confirmada"}]'::jsonb,
    'Referência vinculada criada com sucesso. Exclusão do registro e da US ocorre sem erros.',
    array['referencias','integracao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_036', 'suite_tt_minhasref', 'proj_talenttrack',
    'Criar nova Referência', 'automated', 'medium', 'active',
    'Usuário logado. Acesso à página Minhas Referências.',
    '[{"action":"Criar nova referência","expected":"O formulário é enviado"},{"action":"Validar toast de sucesso","expected":"A mensagem aparece"},{"action":"Confirmar presença na lista","expected":"A referência é listada"},{"action":"Excluir a referência","expected":"A exclusão é confirmada"}]'::jsonb,
    'Referência criada e listada com sucesso.',
    array['minhas-referencias','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_037', 'suite_tt_minhasref', 'proj_talenttrack',
    'Visualizar Referência (via modal de edição)', 'automated', 'medium', 'active',
    'Referência criada.',
    '[{"action":"Criar referência","expected":"O registro é criado"},{"action":"Abrir modal de edição da referência","expected":"O modal é aberto"},{"action":"Validar que os dados carregados estão corretos","expected":"Os dados conferem"}]'::jsonb,
    'Modal exibe os dados corretos.',
    array['minhas-referencias','visualizacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_038', 'suite_tt_minhasref', 'proj_talenttrack',
    'Editar Referência', 'automated', 'medium', 'active',
    'Referência criada.',
    '[{"action":"Criar referência","expected":"O registro é criado"},{"action":"Editar a descrição/título","expected":"Os dados são alterados"},{"action":"Confirmar toast de edição","expected":"A mensagem aparece"},{"action":"Verificar que o registro permanece na lista","expected":"O registro continua visível"}]'::jsonb,
    'Referência atualizada com sucesso.',
    array['minhas-referencias','edicao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_039', 'suite_tt_minhasref', 'proj_talenttrack',
    'Excluir Referência', 'automated', 'medium', 'active',
    'Referência criada.',
    '[{"action":"Criar referência","expected":"O registro é criado"},{"action":"Excluir a referência","expected":"A exclusão é solicitada"},{"action":"Confirmar remoção","expected":"O registro sai da lista"}]'::jsonb,
    'Referência excluída com sucesso.',
    array['minhas-referencias','exclusao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_040', 'suite_tt_minhasref', 'proj_talenttrack',
    'Criar Referência duplicada exibe mensagem de erro', 'automated', 'medium', 'active',
    'Uma referência existente com mesmo título.',
    '[{"action":"Criar referência inicial","expected":"O registro é criado"},{"action":"Tentar criar referência duplicada","expected":"O sistema tenta salvar o duplicado"},{"action":"Validar mensagem de erro na gravação","expected":"O erro é exibido"}]'::jsonb,
    'Duplicação é impedida. Mensagem de erro informa título duplicado.',
    array['minhas-referencias','validacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_041', 'suite_tt_minhasref', 'proj_talenttrack',
    'Criar Referência vinculada a nova US e excluir ambas', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Criar User Story","expected":"A User Story é criada"},{"action":"Adicionar referência vinculada","expected":"A referência é vinculada"},{"action":"Verificar a referência em Minhas Referências","expected":"O registro aparece"},{"action":"Excluir referência","expected":"A exclusão é confirmada"},{"action":"Excluir User Story","expected":"A exclusão é confirmada"}]'::jsonb,
    'Referência vinculada criada e excluída com sucesso. User Story excluída com sucesso.',
    array['minhas-referencias','integracao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_042', 'suite_tt_us', 'proj_talenttrack',
    'Criar nova User Story', 'automated', 'high', 'active',
    'Usuário autenticado. Acesso à tela de User Stories.',
    '[{"action":"Criar User Story com dados válidos","expected":"O formulário é enviado"},{"action":"Validar toast de criação","expected":"A mensagem aparece"},{"action":"Filtrar por título","expected":"A US é localizada"},{"action":"Excluir a User Story","expected":"A exclusão é confirmada"}]'::jsonb,
    'User Story criada com sucesso. A User Story pode ser removida.',
    array['user-stories','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_043', 'suite_tt_us', 'proj_talenttrack',
    'Visualizar User Story', 'automated', 'medium', 'active',
    'User Story criada.',
    '[{"action":"Criar User Story","expected":"A US é criada"},{"action":"Filtrar por título","expected":"A US é localizada"},{"action":"Abrir a visualização","expected":"O modal é aberto"},{"action":"Fechar o modal","expected":"O modal é fechado"}]'::jsonb,
    'O modal de visualização abre corretamente.',
    array['user-stories','visualizacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_044', 'suite_tt_us', 'proj_talenttrack',
    'Editar User Story', 'automated', 'medium', 'active',
    'User Story criada.',
    '[{"action":"Criar User Story","expected":"A US é criada"},{"action":"Filtrar por título","expected":"A US é localizada"},{"action":"Editar a User Story","expected":"As alterações são aplicadas"},{"action":"Filtrar pelo novo título","expected":"A US editada é localizada"},{"action":"Validar a presença da US editada","expected":"O registro atualizado aparece"}]'::jsonb,
    'User Story atualizada com sucesso.',
    array['user-stories','edicao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_045', 'suite_tt_us', 'proj_talenttrack',
    'Excluir User Story', 'automated', 'medium', 'active',
    'User Story criada.',
    '[{"action":"Criar User Story","expected":"A US é criada"},{"action":"Filtrar por título","expected":"A US é localizada"},{"action":"Excluir a User Story","expected":"A exclusão é confirmada"},{"action":"Confirmar remoção","expected":"O registro não aparece mais"}]'::jsonb,
    'User Story excluída com sucesso.',
    array['user-stories','exclusao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_046', 'suite_tt_us', 'proj_talenttrack',
    'Filtrar User Stories', 'automated', 'medium', 'active',
    'User Story criada.',
    '[{"action":"Criar User Story","expected":"A US é criada"},{"action":"Filtrar por título","expected":"A US é localizada"},{"action":"Limpar filtros","expected":"Os filtros são removidos"},{"action":"Validar que a listagem é restaurada","expected":"A listagem completa é exibida"}]'::jsonb,
    'O filtro retorna o registro correto. A listagem é restaurada ao limpar filtros.',
    array['user-stories','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_047', 'suite_tt_us', 'proj_talenttrack',
    'Criar User Story duplicada exibe mensagem de erro', 'automated', 'medium', 'active',
    'Uma User Story existente com mesmo título.',
    '[{"action":"Criar User Story inicial","expected":"A US é criada"},{"action":"Tentar criar outra US com mesmo título","expected":"O sistema tenta salvar o duplicado"},{"action":"Validar mensagem de erro de duplicidade","expected":"O erro é exibido"}]'::jsonb,
    'O sistema impede duplicação. Mensagem de erro é exibida.',
    array['user-stories','validacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_048', 'suite_tt_us', 'proj_talenttrack',
    'Validação CRUD completa', 'automated', 'high', 'active',
    'Usuário autenticado.',
    '[{"action":"Criar User Story","expected":"A US é criada"},{"action":"Filtrar por título","expected":"A US é localizada"},{"action":"Visualizar os detalhes","expected":"O modal abre"},{"action":"Editar a User Story","expected":"As alterações são aplicadas"},{"action":"Excluir a User Story","expected":"A exclusão é confirmada"}]'::jsonb,
    'Ciclo completo de criação, visualização, edição e exclusão validado.',
    array['user-stories','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_049', 'suite_tt_us', 'proj_talenttrack',
    'Limpar filtros', 'automated', 'medium', 'active',
    'A listagem de User Stories está disponível.',
    '[{"action":"Aplicar filtro por título","expected":"A lista é filtrada"},{"action":"Validar a listagem filtrada","expected":"Apenas itens filtrados são exibidos"},{"action":"Limpar filtros","expected":"Os filtros são removidos"},{"action":"Validar que a listagem completa é restaurada","expected":"A lista completa é exibida"}]'::jsonb,
    'Os filtros são removidos. A listagem é apresentada novamente com itens suficientes.',
    array['user-stories','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_050', 'suite_tt_minhasus', 'proj_talenttrack',
    'Criar nova User Story', 'automated', 'medium', 'active',
    'Usuário autenticado. Acesso à tela Minhas User Stories.',
    '[{"action":"Criar User Story na interface Minhas User Stories","expected":"A US é criada"},{"action":"Validar toast de criação","expected":"A mensagem aparece"},{"action":"Excluir a User Story","expected":"A exclusão é confirmada"}]'::jsonb,
    'User Story criada e excluída com sucesso.',
    array['minhas-user-stories','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_051', 'suite_tt_minhasus', 'proj_talenttrack',
    'Visualizar detalhes da User Story', 'automated', 'medium', 'active',
    'User Story criada.',
    '[{"action":"Criar User Story","expected":"A US é criada"},{"action":"Abrir detalhes da US","expected":"Os detalhes são exibidos"},{"action":"Validar exibição das informações","expected":"Os dados aparecem corretamente"}]'::jsonb,
    'Detalhes exibidos corretamente.',
    array['minhas-user-stories','visualizacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_052', 'suite_tt_minhasus', 'proj_talenttrack',
    'Editar User Story', 'automated', 'medium', 'active',
    'User Story criada.',
    '[{"action":"Criar User Story","expected":"A US é criada"},{"action":"Editar dados da US","expected":"As alterações são aplicadas"},{"action":"Validar toast de edição","expected":"A mensagem aparece"}]'::jsonb,
    'US atualizada com sucesso.',
    array['minhas-user-stories','edicao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_053', 'suite_tt_minhasus', 'proj_talenttrack',
    'Excluir User Story', 'automated', 'medium', 'active',
    'User Story criada.',
    '[{"action":"Criar User Story","expected":"A US é criada"},{"action":"Excluir a US","expected":"A exclusão é solicitada"},{"action":"Validar remoção","expected":"O registro não aparece mais"}]'::jsonb,
    'US excluída com sucesso.',
    array['minhas-user-stories','exclusao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_054', 'suite_tt_minhasus', 'proj_talenttrack',
    'Criar User Story duplicada exibe mensagem de erro', 'automated', 'medium', 'active',
    'User Story já existente com mesmo título.',
    '[{"action":"Criar US inicial","expected":"A US é criada"},{"action":"Tentar criar outra US com mesmo título","expected":"O sistema tenta salvar o duplicado"},{"action":"Validar erro de duplicidade","expected":"O erro é exibido"}]'::jsonb,
    'Sistema impede criação duplicada.',
    array['minhas-user-stories','validacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_055', 'suite_tt_minhasus', 'proj_talenttrack',
    'Adicionar referência à User Story, excluir referência e excluir US', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Criar User Story","expected":"A US é criada"},{"action":"Adicionar referência à US","expected":"A referência é vinculada"},{"action":"Excluir referência","expected":"A exclusão é confirmada"},{"action":"Excluir a User Story","expected":"A exclusão é confirmada"}]'::jsonb,
    'Referência vinculada criada com sucesso. Exclusão da referência e da US ocorre sem erros.',
    array['minhas-user-stories','integracao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_056', 'suite_tt_lanc', 'proj_talenttrack',
    'Criar novo lançamento', 'automated', 'medium', 'active',
    'Usuário autenticado. Acesso à tela de Lançamentos.',
    '[{"action":"Criar lançamento com dados válidos","expected":"O formulário é enviado"},{"action":"Validar que o lançamento aparece na listagem","expected":"O item é exibido"},{"action":"Validar total de horas exibido","expected":"O valor correto aparece"}]'::jsonb,
    'Lançamento criado com sucesso. Total de horas exibido corretamente.',
    array['lancamentos','crud'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_057', 'suite_tt_auditoria', 'proj_talenttrack',
    'Filtrar por categoria (Produtos)', 'automated', 'medium', 'active',
    'Usuário autenticado. Acesso à tela de Auditoria.',
    '[{"action":"Filtrar por categoria \"Produtos\"","expected":"O filtro é aplicado"},{"action":"Verificar resultados","expected":"Apenas registros de Produtos são exibidos"}]'::jsonb,
    'Linhas exibidas pertencem à categoria "Produto".',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_058', 'suite_tt_auditoria', 'proj_talenttrack',
    'Filtrar por categoria (Lançamento de Horas)', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Filtrar por categoria \"Lançamento de Horas\"","expected":"O filtro é aplicado"},{"action":"Verificar resultados","expected":"Apenas registros de Lançamento de Horas são exibidos"}]'::jsonb,
    'Linhas exibidas pertencem à categoria correta.',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_059', 'suite_tt_auditoria', 'proj_talenttrack',
    'Filtrar por categoria (Usuários)', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Filtrar por categoria \"Usuários\"","expected":"O filtro é aplicado"},{"action":"Verificar resultados","expected":"Apenas registros de Usuários são exibidos"}]'::jsonb,
    'Linhas exibidas pertencem à categoria "Usuário".',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_060', 'suite_tt_auditoria', 'proj_talenttrack',
    'Filtrar por categoria (Pilares)', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Filtrar por categoria \"Pilares\"","expected":"O filtro é aplicado"},{"action":"Verificar resultados","expected":"Apenas registros de Pilares são exibidos"}]'::jsonb,
    'Linhas exibidas pertencem à categoria "Pilar".',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_061', 'suite_tt_auditoria', 'proj_talenttrack',
    'Filtrar por categoria (Referência)', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Filtrar por categoria \"Referência\"","expected":"O filtro é aplicado"},{"action":"Verificar resultados","expected":"Apenas registros de Referência são exibidos"}]'::jsonb,
    'Linhas exibidas pertencem à categoria "Referência".',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_062', 'suite_tt_auditoria', 'proj_talenttrack',
    'Filtrar por categoria (User Stories)', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Filtrar por categoria \"User Stories\"","expected":"O filtro é aplicado"},{"action":"Verificar resultados","expected":"Apenas registros de User Stories são exibidos"}]'::jsonb,
    'Linhas exibidas pertencem à categoria "User Story".',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_063', 'suite_tt_auditoria', 'proj_talenttrack',
    'Filtrar por categoria (Ações)', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Filtrar por categoria \"Ações\"","expected":"O filtro é aplicado"},{"action":"Verificar resultados","expected":"Apenas registros de Ações são exibidos"}]'::jsonb,
    'Linhas exibidas pertencem à categoria "Ação".',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_064', 'suite_tt_auditoria', 'proj_talenttrack',
    'Filtrar por categoria (Tipos de Atividade)', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Filtrar por categoria \"Tipos de Atividade\"","expected":"O filtro é aplicado"},{"action":"Verificar resultados","expected":"Apenas registros de Tipos de Atividade são exibidos"}]'::jsonb,
    'Linhas exibidas pertencem à categoria "Tipo de Atividade".',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_065', 'suite_tt_auditoria', 'proj_talenttrack',
    'Filtrar por categoria (Clientes)', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Filtrar por categoria \"Clientes\"","expected":"O filtro é aplicado"},{"action":"Verificar resultados","expected":"Apenas registros de Clientes são exibidos"}]'::jsonb,
    'Linhas exibidas pertencem à categoria "Cliente".',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_066', 'suite_tt_auditoria', 'proj_talenttrack',
    'Filtrar por categoria (Squads)', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Filtrar por categoria \"Squads\"","expected":"O filtro é aplicado"},{"action":"Verificar resultados","expected":"Apenas registros de Squads são exibidos"}]'::jsonb,
    'Linhas exibidas pertencem à categoria "Squad".',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_067', 'suite_tt_auditoria', 'proj_talenttrack',
    'Filtrar por tipo de ação (Criação)', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Filtrar por tipo de ação \"Criação\"","expected":"O filtro é aplicado"},{"action":"Verificar resultados","expected":"Apenas registros de Criação são exibidos"}]'::jsonb,
    'Todas as linhas exibidas têm Tipo = "Criação".',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_068', 'suite_tt_auditoria', 'proj_talenttrack',
    'Filtrar por tipo de ação (Atualização)', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Filtrar por tipo de ação \"Atualização\"","expected":"O filtro é aplicado"},{"action":"Verificar resultados","expected":"Apenas registros de Atualização são exibidos"}]'::jsonb,
    'Todas as linhas exibidas têm Tipo = "Atualização".',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_069', 'suite_tt_auditoria', 'proj_talenttrack',
    'Filtrar por tipo de ação (Exclusão)', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Filtrar por tipo de ação \"Exclusão\"","expected":"O filtro é aplicado"},{"action":"Verificar resultados","expected":"Apenas registros de Exclusão são exibidos"}]'::jsonb,
    'Todas as linhas exibidas têm Tipo = "Exclusão".',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_070', 'suite_tt_auditoria', 'proj_talenttrack',
    'Filtrar por intervalo de datas', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Aplicar intervalo de datas","expected":"A busca é filtrada"},{"action":"Verificar resultados","expected":"As datas exibidas estão dentro do intervalo"}]'::jsonb,
    'Linhas exibidas têm datas dentro do intervalo definido.',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_071', 'suite_tt_auditoria', 'proj_talenttrack',
    'Aplicar múltiplos filtros', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Aplicar filtros por entidade e tipo de ação","expected":"Os filtros são aplicados"},{"action":"Verificar resultados","expected":"Apenas registros que atendem a ambos os filtros são exibidos"}]'::jsonb,
    'Resultados apresentam Tipo = "Exclusão" e Categoria = "Produto".',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_072', 'suite_tt_auditoria', 'proj_talenttrack',
    'Limpar filtros restaura listagem completa', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Aplicar filtros","expected":"A lista é filtrada"},{"action":"Limpar filtros","expected":"Os filtros são removidos"},{"action":"Verificar resultados","expected":"A listagem completa é exibida"}]'::jsonb,
    'A listagem volta ao estado completo após limpar filtros.',
    array['auditoria','filtro'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_073', 'suite_tt_auditoria', 'proj_talenttrack',
    'Paginação - Ir para próxima página', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Ir para a próxima página","expected":"A página de resultados muda"},{"action":"Verificar resultados","expected":"Novos registros são exibidos"}]'::jsonb,
    'A página muda com sucesso. Há registros na nova página.',
    array['auditoria','paginacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  ),
  (
    'case_tt_074', 'suite_tt_auditoria', 'proj_talenttrack',
    'Mudar tamanho de página para 25', 'automated', 'medium', 'active',
    'Usuário autenticado.',
    '[{"action":"Alterar tamanho da página para 25","expected":"A página é atualizada"},{"action":"Verificar resultados","expected":"No máximo 25 linhas são exibidas"}]'::jsonb,
    'A listagem exibe até 25 linhas.',
    array['auditoria','paginacao'],
    '{}'::jsonb,
    'seed_qa', '2026-06-04T09:00:00Z', null
  )
on conflict (id) do nothing;
