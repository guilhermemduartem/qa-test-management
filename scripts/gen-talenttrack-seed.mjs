/* Gerador da migration seed do projeto TalentTrack (Miketec_QA_TalentTrack).
   Define projeto, suítes (hierárquicas) e casos de teste como objetos JS e
   emite o SQL idempotente em supabase/migrations/.
   Uso: node scripts/gen-talenttrack-seed.mjs */
import { writeFileSync } from 'node:fs';

const PROJECT_ID = 'proj_talenttrack';
const CREATED_AT = '2026-06-04T09:00:00Z';
const sq = (s) => s.replace(/'/g, "''"); // escapa aspas simples p/ SQL

/* ── Suítes (hierárquicas). parent === null => suíte raiz. ── */
const suites = [
  { id: 'suite_tt_login',     parent: null,             name: 'Login' },
  { id: 'suite_tt_usuarios',  parent: null,             name: 'Usuários' },
  { id: 'suite_tt_config',    parent: null,             name: 'Configurações' },
  { id: 'suite_tt_pilares',   parent: 'suite_tt_config', name: 'Pilares' },
  { id: 'suite_tt_produtos',  parent: 'suite_tt_config', name: 'Produtos' },
  { id: 'suite_tt_clientes',  parent: 'suite_tt_config', name: 'Clientes' },
  { id: 'suite_tt_squads',    parent: 'suite_tt_config', name: 'Squads' },
  { id: 'suite_tt_tipos',     parent: 'suite_tt_config', name: 'Tipos de Atividade' },
  { id: 'suite_tt_acoes',     parent: 'suite_tt_config', name: 'Ações' },
  { id: 'suite_tt_ref',       parent: null,             name: 'Referências' },
  { id: 'suite_tt_minhasref', parent: null,             name: 'Minhas Referências' },
  { id: 'suite_tt_us',        parent: null,             name: 'User Stories' },
  { id: 'suite_tt_minhasus',  parent: null,             name: 'Minhas User Stories' },
  { id: 'suite_tt_lanc',      parent: null,             name: 'Lançamentos' },
  { id: 'suite_tt_auditoria', parent: null,             name: 'Auditoria' },
];

/* helper p/ casos: H=high, M=medium */
const H = 'high';
const M = 'medium';

/* ── Casos. Cada step = { a: ação, e: resultado esperado }. ── */
const cases = [
  // ───────── Login ─────────
  { suite: 'suite_tt_login', code: 'TC01', title: 'Login com credenciais válidas', pri: H,
    tags: ['login', 'autenticacao'], by: 'seed_qa',
    pre: 'A página de login está disponível. Credenciais válidas configuradas em CREDENTIALS.',
    steps: [
      { a: 'Acessar a página de login', e: 'A página de login é exibida' },
      { a: 'Informar e-mail e senha válidos', e: 'Os campos são preenchidos corretamente' },
      { a: 'Submeter o formulário', e: 'O login é enviado' },
      { a: 'Aguardar o welcome message', e: 'A mensagem "Seja bem-vindo" aparece' },
    ],
    expected: 'O sistema apresenta a mensagem "Seja bem-vindo". Login concluído com sucesso.' },
  { suite: 'suite_tt_login', code: 'TC02', title: 'Login com senha incorreta', pri: M,
    tags: ['login', 'erro'], by: 'seed_qa',
    pre: 'A página de login está disponível. O e-mail utilizado é válido.',
    steps: [
      { a: 'Acessar a página de login', e: 'A página de login é exibida' },
      { a: 'Informar e-mail válido e senha errada', e: 'Os dados são inseridos' },
      { a: 'Tentar fazer login', e: 'O sistema retorna erro de credenciais' },
    ],
    expected: 'É exibida a mensagem de erro "E-mail ou senha incorreto".' },
  { suite: 'suite_tt_login', code: 'TC03', title: 'Login com e-mail não cadastrado', pri: M,
    tags: ['login', 'erro'], by: 'seed_qa',
    pre: 'A página de login está disponível.',
    steps: [
      { a: 'Acessar a página de login', e: 'A página de login é exibida' },
      { a: 'Informar e-mail não cadastrado e senha válida', e: 'Os dados são inseridos' },
      { a: 'Tentar fazer login', e: 'O sistema retorna erro de usuário inexistente' },
    ],
    expected: 'É exibida a mensagem de erro "E-mail ou senha incorreto".' },
  { suite: 'suite_tt_login', code: 'TC04', title: 'Login com campos vazios', pri: M,
    tags: ['login', 'validacao'], by: 'seed_qa',
    pre: 'A página de login está disponível.',
    steps: [
      { a: 'Acessar a página de login', e: 'A página de login é exibida' },
      { a: 'Deixar e-mail e senha em branco', e: 'Os campos permanecem vazios' },
      { a: 'Clicar em entrar', e: 'A validação de campo é disparada' },
    ],
    expected: 'O campo de e-mail exibe mensagem de validação "Preencha este campo".' },
  { suite: 'suite_tt_login', code: 'TC05', title: 'Login apenas com e-mail (sem senha)', pri: M,
    tags: ['login', 'validacao'], by: 'seed_qa',
    pre: 'A página de login está disponível.',
    steps: [
      { a: 'Acessar a página de login', e: 'A página de login é exibida' },
      { a: 'Informar e-mail válido e deixar a senha em branco', e: 'O e-mail é preenchido e a senha fica vazia' },
      { a: 'Clicar em entrar', e: 'O sistema exibe erro de campo obrigatório' },
    ],
    expected: 'O campo de senha exibe mensagem de validação "Preencha este campo".' },
  { suite: 'suite_tt_login', code: 'TC06', title: 'Login apenas com senha (sem e-mail)', pri: M,
    tags: ['login', 'validacao'], by: 'seed_qa',
    pre: 'A página de login está disponível.',
    steps: [
      { a: 'Acessar a página de login', e: 'A página de login é exibida' },
      { a: 'Informar senha válida e deixar o e-mail em branco', e: 'A senha é preenchida e o e-mail fica vazio' },
      { a: 'Clicar em entrar', e: 'O sistema exibe erro de campo obrigatório' },
    ],
    expected: 'O campo de e-mail exibe mensagem de validação "Preencha este campo".' },
  { suite: 'suite_tt_login', code: 'TC07', title: 'Login com formato de e-mail inválido', pri: M,
    tags: ['login', 'validacao'], by: 'seed_qa',
    pre: 'A página de login está disponível.',
    steps: [
      { a: 'Acessar a página de login', e: 'A página de login é exibida' },
      { a: 'Informar um e-mail sem @ e senha válida', e: 'O e-mail é inserido em formato inválido' },
      { a: 'Clicar em entrar', e: 'A validação do e-mail é acionada' },
    ],
    expected: 'O campo de e-mail exibe mensagem de validação informando que o @ está faltando.' },

  // ───────── Usuários ─────────
  { suite: 'suite_tt_usuarios', code: 'TC01', title: 'Criar usuário Regular', pri: H,
    tags: ['usuarios', 'cadastro'], by: 'seed_admin',
    pre: 'Usuário autenticado no Backoffice. Acesso à tela de usuários.',
    steps: [
      { a: 'Navegar para a tela de Usuários', e: 'A tela de usuários é exibida' },
      { a: 'Clicar em "Adicionar"', e: 'O formulário de cadastro é aberto' },
      { a: 'Preencher o formulário completo com dados pessoais, identificação, profissional e segurança', e: 'Todos os campos são preenchidos' },
      { a: 'Salvar o usuário', e: 'O cadastro é enviado' },
      { a: 'Filtrar por e-mail criado', e: 'O usuário aparece na listagem' },
    ],
    expected: 'O usuário aparece na listagem. O sistema permite excluir o usuário criado.' },
  { suite: 'suite_tt_usuarios', code: 'TC02', title: 'Criar usuário Admin', pri: H,
    tags: ['usuarios', 'cadastro'], by: 'seed_admin',
    pre: 'Usuário autenticado no Backoffice. Acesso à tela de usuários.',
    steps: [
      { a: 'Navegar para a tela de Usuários', e: 'A tela de usuários é exibida' },
      { a: 'Clicar em "Adicionar"', e: 'O formulário de cadastro é aberto' },
      { a: 'Preencher o formulário com tipo de conta Admin', e: 'O tipo Admin é selecionado' },
      { a: 'Salvar o usuário', e: 'O cadastro é enviado' },
      { a: 'Filtrar por username ou e-mail', e: 'O usuário Admin aparece na listagem' },
    ],
    expected: 'O usuário Admin é criado com sucesso. O usuário aparece na listagem. O sistema permite excluir o usuário criado.' },
  { suite: 'suite_tt_usuarios', code: 'TC03', title: 'Editar usuário', pri: H,
    tags: ['usuarios', 'edicao'], by: 'seed_admin',
    pre: 'Usuário autenticado no Backoffice. Acesso à tela de usuários.',
    steps: [
      { a: 'Criar um usuário de teste', e: 'O usuário de teste é criado' },
      { a: 'Filtrar por e-mail', e: 'O usuário é localizado' },
      { a: 'Editar os dados do usuário (nome, telefone, cargo, descrição, senha)', e: 'Os campos são alterados' },
      { a: 'Salvar a alteração', e: 'A atualização é enviada' },
      { a: 'Filtrar novamente e validar a edição', e: 'O registro atualizado aparece' },
    ],
    expected: 'O toast de atualização aparece. O usuário editado é exibido na listagem. O usuário pode ser excluído com sucesso.' },

  // ───────── Configurações > Pilares ─────────
  { suite: 'suite_tt_pilares', code: 'TC01', title: 'Listar Pilares', pri: M,
    tags: ['configuracoes', 'listagem'], by: 'seed_qa',
    pre: 'Usuário autenticado no Backoffice. Acesso à tela de Pilares.',
    steps: [
      { a: 'Navegar até Pilares', e: 'A tela de Pilares é exibida' },
      { a: 'Verificar que a listagem é carregada', e: 'A listagem contém itens' },
      { a: 'Confirmar presença do botão de adicionar', e: 'O botão está visível' },
    ],
    expected: 'A listagem está visível. O botão de adicionar está disponível.' },
  { suite: 'suite_tt_pilares', code: 'TC02', title: 'Criar novo Pilar', pri: H,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Usuário autenticado. Acesso à tela de Pilares.',
    steps: [
      { a: 'Criar um novo pilar com dados válidos', e: 'O formulário é preenchido' },
      { a: 'Confirmar toast de criação', e: 'A mensagem de sucesso aparece' },
      { a: 'Validar que o pilar aparece na lista', e: 'O registro aparece' },
      { a: 'Excluir o pilar', e: 'A exclusão é confirmada' },
    ],
    expected: 'Pilar criado com sucesso. Pilar aparece na listagem. Exclusão é permitida.' },
  { suite: 'suite_tt_pilares', code: 'TC03', title: 'Editar Pilar', pri: H,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Pilar existente criado para o teste.',
    steps: [
      { a: 'Criar um pilar de teste', e: 'O pilar é criado' },
      { a: 'Editar o pilar criado', e: 'As alterações são aplicadas' },
      { a: 'Confirmar toast de edição', e: 'A mensagem de sucesso aparece' },
      { a: 'Validar que o pilar editado aparece na lista', e: 'O registro atualizado aparece' },
      { a: 'Excluir o pilar', e: 'A exclusão é confirmada' },
    ],
    expected: 'Alterações salvas com sucesso. O pilar editado aparece na listagem.' },
  { suite: 'suite_tt_pilares', code: 'TC04', title: 'Excluir Pilar', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Pilar existente criado para o teste.',
    steps: [
      { a: 'Criar um pilar', e: 'O pilar é criado' },
      { a: 'Excluir o pilar', e: 'A exclusão é solicitada' },
      { a: 'Confirmar toast de exclusão', e: 'A mensagem aparece' },
      { a: 'Validar que o pilar foi removido', e: 'O registro não existe mais' },
    ],
    expected: 'Pilar excluído com sucesso. O pilar não aparece mais na lista.' },

  // ───────── Configurações > Produtos ─────────
  { suite: 'suite_tt_produtos', code: 'TC06', title: 'Criar novo Produto', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Usuário autenticado. Acesso à tela de Produtos.',
    steps: [
      { a: 'Criar um novo produto com dados válidos', e: 'O formulário é preenchido' },
      { a: 'Confirmar toast de criação', e: 'A mensagem de sucesso aparece' },
      { a: 'Validar que o produto aparece na listagem', e: 'O produto é listado' },
      { a: 'Excluir o produto', e: 'A exclusão é confirmada' },
    ],
    expected: 'Produto criado com sucesso. Produto removido com sucesso.' },
  { suite: 'suite_tt_produtos', code: 'TC07', title: 'Editar Produto', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Produto de teste criado.',
    steps: [
      { a: 'Criar produto de teste', e: 'O produto é criado' },
      { a: 'Editar o produto', e: 'As alterações são aplicadas' },
      { a: 'Confirmar toast de edição', e: 'A mensagem de sucesso aparece' },
      { a: 'Validar que o produto com novo nome aparece na lista', e: 'O produto atualizado aparece' },
      { a: 'Excluir o produto', e: 'A exclusão é confirmada' },
    ],
    expected: 'Produto atualizado com sucesso. Alterações aparecem na listagem.' },
  { suite: 'suite_tt_produtos', code: 'TC08', title: 'Excluir Produto', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Produto de teste criado.',
    steps: [
      { a: 'Criar produto de teste', e: 'O produto é criado' },
      { a: 'Excluir o produto', e: 'A exclusão é solicitada' },
      { a: 'Confirmar toast de exclusão', e: 'A mensagem aparece' },
      { a: 'Validar que o produto desapareceu da lista', e: 'O registro não existe mais' },
    ],
    expected: 'Produto excluído com sucesso.' },

  // ───────── Configurações > Clientes ─────────
  { suite: 'suite_tt_clientes', code: 'TC10', title: 'Criar novo Cliente', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Usuário autenticado. Acesso à tela de Clientes.',
    steps: [
      { a: 'Criar um cliente válido', e: 'O formulário é preenchido' },
      { a: 'Confirmar toast de criação', e: 'A mensagem de sucesso aparece' },
      { a: 'Validar presença do cliente na lista', e: 'O cliente é listado' },
      { a: 'Excluir o cliente', e: 'A exclusão é confirmada' },
    ],
    expected: 'Cliente criado e removido com sucesso.' },
  { suite: 'suite_tt_clientes', code: 'TC11', title: 'Editar Cliente', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Cliente de teste criado.',
    steps: [
      { a: 'Criar cliente de teste', e: 'O cliente é criado' },
      { a: 'Editar o cliente', e: 'As alterações são aplicadas' },
      { a: 'Confirmar toast de edição', e: 'A mensagem de sucesso aparece' },
      { a: 'Validar que o cliente editado aparece na lista', e: 'O registro atualizado aparece' },
    ],
    expected: 'Cliente atualizado com sucesso.' },
  { suite: 'suite_tt_clientes', code: 'TC12', title: 'Excluir Cliente', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Cliente de teste criado.',
    steps: [
      { a: 'Criar cliente de teste', e: 'O cliente é criado' },
      { a: 'Excluir o cliente', e: 'A exclusão é solicitada' },
      { a: 'Confirmar toast de exclusão', e: 'A mensagem aparece' },
      { a: 'Validar que o cliente não aparece mais', e: 'O registro não existe mais' },
    ],
    expected: 'Cliente excluído com sucesso.' },

  // ───────── Configurações > Squads ─────────
  { suite: 'suite_tt_squads', code: 'TC14', title: 'Criar novo Squad', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Usuário autenticado. Acesso à tela de Squads.',
    steps: [
      { a: 'Criar um squad válido', e: 'O formulário é preenchido' },
      { a: 'Confirmar toast de criação', e: 'A mensagem de sucesso aparece' },
      { a: 'Validar que o squad aparece na lista', e: 'O registro aparece' },
      { a: 'Excluir o squad', e: 'A exclusão é confirmada' },
    ],
    expected: 'Squad criado e removido com sucesso.' },
  { suite: 'suite_tt_squads', code: 'TC15', title: 'Editar Squad', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Squad de teste criado.',
    steps: [
      { a: 'Criar squad de teste', e: 'O squad é criado' },
      { a: 'Editar o squad', e: 'As alterações são aplicadas' },
      { a: 'Confirmar toast de edição', e: 'A mensagem de sucesso aparece' },
      { a: 'Validar a alteração na listagem', e: 'O squad atualizado aparece' },
    ],
    expected: 'Squad atualizado com sucesso.' },
  { suite: 'suite_tt_squads', code: 'TC16', title: 'Excluir Squad', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Squad de teste criado.',
    steps: [
      { a: 'Criar squad de teste', e: 'O squad é criado' },
      { a: 'Excluir o squad', e: 'A exclusão é solicitada' },
      { a: 'Validar remoção da listagem', e: 'O registro não existe mais' },
    ],
    expected: 'Squad excluído com sucesso.' },

  // ───────── Configurações > Tipos de Atividade ─────────
  { suite: 'suite_tt_tipos', code: 'TC18', title: 'Criar novo Tipo de Atividade', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Usuário autenticado. Acesso à tela de Tipos de Atividade.',
    steps: [
      { a: 'Criar um tipo de atividade válido', e: 'O formulário é preenchido' },
      { a: 'Confirmar toast de criação', e: 'A mensagem de sucesso aparece' },
      { a: 'Validar presença do tipo na lista', e: 'O registro aparece' },
      { a: 'Excluir o tipo', e: 'A exclusão é confirmada' },
    ],
    expected: 'Tipo de atividade criado e removido com sucesso.' },
  { suite: 'suite_tt_tipos', code: 'TC19', title: 'Editar Tipo de Atividade', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Tipo de atividade de teste criado.',
    steps: [
      { a: 'Criar tipo de atividade', e: 'O tipo é criado' },
      { a: 'Editar o tipo', e: 'As alterações são aplicadas' },
      { a: 'Confirmar toast de edição', e: 'A mensagem de sucesso aparece' },
      { a: 'Validar a alteração na lista', e: 'O registro atualizado aparece' },
    ],
    expected: 'Tipo de atividade atualizado com sucesso.' },
  { suite: 'suite_tt_tipos', code: 'TC20', title: 'Excluir Tipo de Atividade', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Tipo de atividade de teste criado.',
    steps: [
      { a: 'Criar tipo de atividade', e: 'O tipo é criado' },
      { a: 'Excluir o tipo', e: 'A exclusão é solicitada' },
      { a: 'Confirmar remoção', e: 'A mensagem de exclusão aparece' },
    ],
    expected: 'Tipo excluído com sucesso.' },

  // ───────── Configurações > Ações ─────────
  { suite: 'suite_tt_acoes', code: 'TC22', title: 'Criar nova Ação', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Usuário autenticado. Acesso à tela de Ações.',
    steps: [
      { a: 'Criar ação com dados válidos', e: 'O formulário é preenchido' },
      { a: 'Confirmar toast de criação', e: 'A mensagem de sucesso aparece' },
      { a: 'Validar que a ação aparece na listagem', e: 'O registro aparece' },
      { a: 'Excluir a ação', e: 'A exclusão é confirmada' },
    ],
    expected: 'Ação criada e removida com sucesso.' },
  { suite: 'suite_tt_acoes', code: 'TC23', title: 'Editar Ação', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Ação de teste criada.',
    steps: [
      { a: 'Criar uma ação', e: 'A ação é criada' },
      { a: 'Editar a ação', e: 'As alterações são aplicadas' },
      { a: 'Confirmar toast de edição', e: 'A mensagem de sucesso aparece' },
      { a: 'Validar a alteração na lista', e: 'O registro atualizado aparece' },
    ],
    expected: 'Ação atualizada com sucesso.' },
  { suite: 'suite_tt_acoes', code: 'TC24', title: 'Excluir Ação', pri: M,
    tags: ['configuracoes', 'crud'], by: 'seed_qa',
    pre: 'Ação de teste criada.',
    steps: [
      { a: 'Criar uma ação', e: 'A ação é criada' },
      { a: 'Excluir a ação', e: 'A exclusão é solicitada' },
      { a: 'Confirmar remoção', e: 'A mensagem de exclusão aparece' },
    ],
    expected: 'Ação excluída com sucesso.' },

  // ───────── Referências ─────────
  { suite: 'suite_tt_ref', code: 'TC02', title: 'Criar nova Referência', pri: M,
    tags: ['referencias', 'crud'], by: 'seed_qa',
    pre: 'Usuário autenticado. Acesso à página de Referências.',
    steps: [
      { a: 'Clicar em adicionar nova referência', e: 'O formulário é aberto' },
      { a: 'Preencher o formulário com dados válidos', e: 'Os campos são preenchidos' },
      { a: 'Salvar a referência', e: 'O cadastro é enviado' },
      { a: 'Validar toast de sucesso', e: 'A mensagem aparece' },
    ],
    expected: 'Referência criada com sucesso. Referência aparece na listagem.' },
  { suite: 'suite_tt_ref', code: 'TC03', title: 'Visualizar Referência (via modal de edição)', pri: M,
    tags: ['referencias', 'visualizacao'], by: 'seed_qa',
    pre: 'Referência criada no teste.',
    steps: [
      { a: 'Criar um registro de referência', e: 'O registro é criado' },
      { a: 'Abrir o modal de edição da referência', e: 'O modal é aberto' },
      { a: 'Verificar que os dados exibidos correspondem ao título criado', e: 'Os dados estão corretos' },
    ],
    expected: 'O modal abre com os dados corretos.' },
  { suite: 'suite_tt_ref', code: 'TC04', title: 'Editar Referência', pri: M,
    tags: ['referencias', 'edicao'], by: 'seed_qa',
    pre: 'Referência criada.',
    steps: [
      { a: 'Criar referência de teste', e: 'O registro é criado' },
      { a: 'Editar a descrição/título conforme o fluxo', e: 'Os dados são alterados' },
      { a: 'Salvar e validar toast de atualização', e: 'A mensagem aparece' },
      { a: 'Verificar que a referência ainda existe na lista', e: 'O registro permanece' },
    ],
    expected: 'Referência atualizada com sucesso. Registro permanece visível após edição.' },
  { suite: 'suite_tt_ref', code: 'TC05', title: 'Excluir Referência', pri: M,
    tags: ['referencias', 'exclusao'], by: 'seed_qa',
    pre: 'Referência criada.',
    steps: [
      { a: 'Criar referência de teste', e: 'O registro é criado' },
      { a: 'Excluir a referência', e: 'A exclusão é solicitada' },
      { a: 'Validar toast de exclusão', e: 'A mensagem aparece' },
      { a: 'Confirmar remoção da lista', e: 'O registro não aparece mais' },
    ],
    expected: 'Referência excluída com sucesso. Registro não aparece mais.' },
  { suite: 'suite_tt_ref', code: 'TC06', title: 'Criar Referência duplicada exibe mensagem de erro', pri: M,
    tags: ['referencias', 'validacao'], by: 'seed_qa',
    pre: 'Uma referência existente com o mesmo título.',
    steps: [
      { a: 'Criar referência inicial', e: 'O registro é criado' },
      { a: 'Tentar criar nova referência com mesmo título', e: 'O sistema tenta salvar duplicado' },
      { a: 'Validar mensagem de erro de duplicidade', e: 'O erro é exibido' },
    ],
    expected: 'O sistema impede a duplicação. Mensagem de erro informa que já existe uma referência com este nome.' },
  { suite: 'suite_tt_ref', code: 'TC07', title: 'Criar Referência vinculada a nova US e excluir ambas', pri: M,
    tags: ['referencias', 'integracao'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Criar uma nova User Story', e: 'A User Story é criada' },
      { a: 'Adicionar uma referência vinculada a essa User Story', e: 'A referência é vinculada' },
      { a: 'Validar que a referência aparece em Minhas Referências', e: 'O registro aparece' },
      { a: 'Excluir a referência', e: 'A exclusão é confirmada' },
      { a: 'Excluir a User Story', e: 'A exclusão é confirmada' },
    ],
    expected: 'Referência vinculada criada com sucesso. Exclusão do registro e da US ocorre sem erros.' },

  // ───────── Minhas Referências ─────────
  { suite: 'suite_tt_minhasref', code: 'TC02', title: 'Criar nova Referência', pri: M,
    tags: ['minhas-referencias', 'crud'], by: 'seed_qa',
    pre: 'Usuário logado. Acesso à página Minhas Referências.',
    steps: [
      { a: 'Criar nova referência', e: 'O formulário é enviado' },
      { a: 'Validar toast de sucesso', e: 'A mensagem aparece' },
      { a: 'Confirmar presença na lista', e: 'A referência é listada' },
      { a: 'Excluir a referência', e: 'A exclusão é confirmada' },
    ],
    expected: 'Referência criada e listada com sucesso.' },
  { suite: 'suite_tt_minhasref', code: 'TC03', title: 'Visualizar Referência (via modal de edição)', pri: M,
    tags: ['minhas-referencias', 'visualizacao'], by: 'seed_qa',
    pre: 'Referência criada.',
    steps: [
      { a: 'Criar referência', e: 'O registro é criado' },
      { a: 'Abrir modal de edição da referência', e: 'O modal é aberto' },
      { a: 'Validar que os dados carregados estão corretos', e: 'Os dados conferem' },
    ],
    expected: 'Modal exibe os dados corretos.' },
  { suite: 'suite_tt_minhasref', code: 'TC04', title: 'Editar Referência', pri: M,
    tags: ['minhas-referencias', 'edicao'], by: 'seed_qa',
    pre: 'Referência criada.',
    steps: [
      { a: 'Criar referência', e: 'O registro é criado' },
      { a: 'Editar a descrição/título', e: 'Os dados são alterados' },
      { a: 'Confirmar toast de edição', e: 'A mensagem aparece' },
      { a: 'Verificar que o registro permanece na lista', e: 'O registro continua visível' },
    ],
    expected: 'Referência atualizada com sucesso.' },
  { suite: 'suite_tt_minhasref', code: 'TC05', title: 'Excluir Referência', pri: M,
    tags: ['minhas-referencias', 'exclusao'], by: 'seed_qa',
    pre: 'Referência criada.',
    steps: [
      { a: 'Criar referência', e: 'O registro é criado' },
      { a: 'Excluir a referência', e: 'A exclusão é solicitada' },
      { a: 'Confirmar remoção', e: 'O registro sai da lista' },
    ],
    expected: 'Referência excluída com sucesso.' },
  { suite: 'suite_tt_minhasref', code: 'TC06', title: 'Criar Referência duplicada exibe mensagem de erro', pri: M,
    tags: ['minhas-referencias', 'validacao'], by: 'seed_qa',
    pre: 'Uma referência existente com mesmo título.',
    steps: [
      { a: 'Criar referência inicial', e: 'O registro é criado' },
      { a: 'Tentar criar referência duplicada', e: 'O sistema tenta salvar o duplicado' },
      { a: 'Validar mensagem de erro na gravação', e: 'O erro é exibido' },
    ],
    expected: 'Duplicação é impedida. Mensagem de erro informa título duplicado.' },
  { suite: 'suite_tt_minhasref', code: 'TC07', title: 'Criar Referência vinculada a nova US e excluir ambas', pri: M,
    tags: ['minhas-referencias', 'integracao'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Criar User Story', e: 'A User Story é criada' },
      { a: 'Adicionar referência vinculada', e: 'A referência é vinculada' },
      { a: 'Verificar a referência em Minhas Referências', e: 'O registro aparece' },
      { a: 'Excluir referência', e: 'A exclusão é confirmada' },
      { a: 'Excluir User Story', e: 'A exclusão é confirmada' },
    ],
    expected: 'Referência vinculada criada e excluída com sucesso. User Story excluída com sucesso.' },

  // ───────── User Stories ─────────
  { suite: 'suite_tt_us', code: 'TC02', title: 'Criar nova User Story', pri: H,
    tags: ['user-stories', 'crud'], by: 'seed_qa',
    pre: 'Usuário autenticado. Acesso à tela de User Stories.',
    steps: [
      { a: 'Criar User Story com dados válidos', e: 'O formulário é enviado' },
      { a: 'Validar toast de criação', e: 'A mensagem aparece' },
      { a: 'Filtrar por título', e: 'A US é localizada' },
      { a: 'Excluir a User Story', e: 'A exclusão é confirmada' },
    ],
    expected: 'User Story criada com sucesso. A User Story pode ser removida.' },
  { suite: 'suite_tt_us', code: 'TC03', title: 'Visualizar User Story', pri: M,
    tags: ['user-stories', 'visualizacao'], by: 'seed_qa',
    pre: 'User Story criada.',
    steps: [
      { a: 'Criar User Story', e: 'A US é criada' },
      { a: 'Filtrar por título', e: 'A US é localizada' },
      { a: 'Abrir a visualização', e: 'O modal é aberto' },
      { a: 'Fechar o modal', e: 'O modal é fechado' },
    ],
    expected: 'O modal de visualização abre corretamente.' },
  { suite: 'suite_tt_us', code: 'TC04', title: 'Editar User Story', pri: M,
    tags: ['user-stories', 'edicao'], by: 'seed_qa',
    pre: 'User Story criada.',
    steps: [
      { a: 'Criar User Story', e: 'A US é criada' },
      { a: 'Filtrar por título', e: 'A US é localizada' },
      { a: 'Editar a User Story', e: 'As alterações são aplicadas' },
      { a: 'Filtrar pelo novo título', e: 'A US editada é localizada' },
      { a: 'Validar a presença da US editada', e: 'O registro atualizado aparece' },
    ],
    expected: 'User Story atualizada com sucesso.' },
  { suite: 'suite_tt_us', code: 'TC06', title: 'Excluir User Story', pri: M,
    tags: ['user-stories', 'exclusao'], by: 'seed_qa',
    pre: 'User Story criada.',
    steps: [
      { a: 'Criar User Story', e: 'A US é criada' },
      { a: 'Filtrar por título', e: 'A US é localizada' },
      { a: 'Excluir a User Story', e: 'A exclusão é confirmada' },
      { a: 'Confirmar remoção', e: 'O registro não aparece mais' },
    ],
    expected: 'User Story excluída com sucesso.' },
  { suite: 'suite_tt_us', code: 'TC07', title: 'Filtrar User Stories', pri: M,
    tags: ['user-stories', 'filtro'], by: 'seed_qa',
    pre: 'User Story criada.',
    steps: [
      { a: 'Criar User Story', e: 'A US é criada' },
      { a: 'Filtrar por título', e: 'A US é localizada' },
      { a: 'Limpar filtros', e: 'Os filtros são removidos' },
      { a: 'Validar que a listagem é restaurada', e: 'A listagem completa é exibida' },
    ],
    expected: 'O filtro retorna o registro correto. A listagem é restaurada ao limpar filtros.' },
  { suite: 'suite_tt_us', code: 'TC08', title: 'Criar User Story duplicada exibe mensagem de erro', pri: M,
    tags: ['user-stories', 'validacao'], by: 'seed_qa',
    pre: 'Uma User Story existente com mesmo título.',
    steps: [
      { a: 'Criar User Story inicial', e: 'A US é criada' },
      { a: 'Tentar criar outra US com mesmo título', e: 'O sistema tenta salvar o duplicado' },
      { a: 'Validar mensagem de erro de duplicidade', e: 'O erro é exibido' },
    ],
    expected: 'O sistema impede duplicação. Mensagem de erro é exibida.' },
  { suite: 'suite_tt_us', code: 'TC09', title: 'Validação CRUD completa', pri: H,
    tags: ['user-stories', 'crud'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Criar User Story', e: 'A US é criada' },
      { a: 'Filtrar por título', e: 'A US é localizada' },
      { a: 'Visualizar os detalhes', e: 'O modal abre' },
      { a: 'Editar a User Story', e: 'As alterações são aplicadas' },
      { a: 'Excluir a User Story', e: 'A exclusão é confirmada' },
    ],
    expected: 'Ciclo completo de criação, visualização, edição e exclusão validado.' },
  { suite: 'suite_tt_us', code: 'TC10', title: 'Limpar filtros', pri: M,
    tags: ['user-stories', 'filtro'], by: 'seed_qa',
    pre: 'A listagem de User Stories está disponível.',
    steps: [
      { a: 'Aplicar filtro por título', e: 'A lista é filtrada' },
      { a: 'Validar a listagem filtrada', e: 'Apenas itens filtrados são exibidos' },
      { a: 'Limpar filtros', e: 'Os filtros são removidos' },
      { a: 'Validar que a listagem completa é restaurada', e: 'A lista completa é exibida' },
    ],
    expected: 'Os filtros são removidos. A listagem é apresentada novamente com itens suficientes.' },

  // ───────── Minhas User Stories ─────────
  { suite: 'suite_tt_minhasus', code: 'TC01', title: 'Criar nova User Story', pri: M,
    tags: ['minhas-user-stories', 'crud'], by: 'seed_qa',
    pre: 'Usuário autenticado. Acesso à tela Minhas User Stories.',
    steps: [
      { a: 'Criar User Story na interface Minhas User Stories', e: 'A US é criada' },
      { a: 'Validar toast de criação', e: 'A mensagem aparece' },
      { a: 'Excluir a User Story', e: 'A exclusão é confirmada' },
    ],
    expected: 'User Story criada e excluída com sucesso.' },
  { suite: 'suite_tt_minhasus', code: 'TC02', title: 'Visualizar detalhes da User Story', pri: M,
    tags: ['minhas-user-stories', 'visualizacao'], by: 'seed_qa',
    pre: 'User Story criada.',
    steps: [
      { a: 'Criar User Story', e: 'A US é criada' },
      { a: 'Abrir detalhes da US', e: 'Os detalhes são exibidos' },
      { a: 'Validar exibição das informações', e: 'Os dados aparecem corretamente' },
    ],
    expected: 'Detalhes exibidos corretamente.' },
  { suite: 'suite_tt_minhasus', code: 'TC03', title: 'Editar User Story', pri: M,
    tags: ['minhas-user-stories', 'edicao'], by: 'seed_qa',
    pre: 'User Story criada.',
    steps: [
      { a: 'Criar User Story', e: 'A US é criada' },
      { a: 'Editar dados da US', e: 'As alterações são aplicadas' },
      { a: 'Validar toast de edição', e: 'A mensagem aparece' },
    ],
    expected: 'US atualizada com sucesso.' },
  { suite: 'suite_tt_minhasus', code: 'TC04', title: 'Excluir User Story', pri: M,
    tags: ['minhas-user-stories', 'exclusao'], by: 'seed_qa',
    pre: 'User Story criada.',
    steps: [
      { a: 'Criar User Story', e: 'A US é criada' },
      { a: 'Excluir a US', e: 'A exclusão é solicitada' },
      { a: 'Validar remoção', e: 'O registro não aparece mais' },
    ],
    expected: 'US excluída com sucesso.' },
  { suite: 'suite_tt_minhasus', code: 'TC05', title: 'Criar User Story duplicada exibe mensagem de erro', pri: M,
    tags: ['minhas-user-stories', 'validacao'], by: 'seed_qa',
    pre: 'User Story já existente com mesmo título.',
    steps: [
      { a: 'Criar US inicial', e: 'A US é criada' },
      { a: 'Tentar criar outra US com mesmo título', e: 'O sistema tenta salvar o duplicado' },
      { a: 'Validar erro de duplicidade', e: 'O erro é exibido' },
    ],
    expected: 'Sistema impede criação duplicada.' },
  { suite: 'suite_tt_minhasus', code: 'TC06', title: 'Adicionar referência à User Story, excluir referência e excluir US', pri: M,
    tags: ['minhas-user-stories', 'integracao'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Criar User Story', e: 'A US é criada' },
      { a: 'Adicionar referência à US', e: 'A referência é vinculada' },
      { a: 'Excluir referência', e: 'A exclusão é confirmada' },
      { a: 'Excluir a User Story', e: 'A exclusão é confirmada' },
    ],
    expected: 'Referência vinculada criada com sucesso. Exclusão da referência e da US ocorre sem erros.' },

  // ───────── Lançamentos ─────────
  { suite: 'suite_tt_lanc', code: 'TC02', title: 'Criar novo lançamento', pri: M,
    tags: ['lancamentos', 'crud'], by: 'seed_qa',
    pre: 'Usuário autenticado. Acesso à tela de Lançamentos.',
    steps: [
      { a: 'Criar lançamento com dados válidos', e: 'O formulário é enviado' },
      { a: 'Validar que o lançamento aparece na listagem', e: 'O item é exibido' },
      { a: 'Validar total de horas exibido', e: 'O valor correto aparece' },
    ],
    expected: 'Lançamento criado com sucesso. Total de horas exibido corretamente.' },

  // ───────── Auditoria ─────────
  { suite: 'suite_tt_auditoria', code: 'TC03', title: 'Filtrar por categoria (Produtos)', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado. Acesso à tela de Auditoria.',
    steps: [
      { a: 'Filtrar por categoria "Produtos"', e: 'O filtro é aplicado' },
      { a: 'Verificar resultados', e: 'Apenas registros de Produtos são exibidos' },
    ],
    expected: 'Linhas exibidas pertencem à categoria "Produto".' },
  { suite: 'suite_tt_auditoria', code: 'TC03.1', title: 'Filtrar por categoria (Lançamento de Horas)', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Filtrar por categoria "Lançamento de Horas"', e: 'O filtro é aplicado' },
      { a: 'Verificar resultados', e: 'Apenas registros de Lançamento de Horas são exibidos' },
    ],
    expected: 'Linhas exibidas pertencem à categoria correta.' },
  { suite: 'suite_tt_auditoria', code: 'TC03.2', title: 'Filtrar por categoria (Usuários)', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Filtrar por categoria "Usuários"', e: 'O filtro é aplicado' },
      { a: 'Verificar resultados', e: 'Apenas registros de Usuários são exibidos' },
    ],
    expected: 'Linhas exibidas pertencem à categoria "Usuário".' },
  { suite: 'suite_tt_auditoria', code: 'TC03.3', title: 'Filtrar por categoria (Pilares)', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Filtrar por categoria "Pilares"', e: 'O filtro é aplicado' },
      { a: 'Verificar resultados', e: 'Apenas registros de Pilares são exibidos' },
    ],
    expected: 'Linhas exibidas pertencem à categoria "Pilar".' },
  { suite: 'suite_tt_auditoria', code: 'TC03.4', title: 'Filtrar por categoria (Referência)', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Filtrar por categoria "Referência"', e: 'O filtro é aplicado' },
      { a: 'Verificar resultados', e: 'Apenas registros de Referência são exibidos' },
    ],
    expected: 'Linhas exibidas pertencem à categoria "Referência".' },
  { suite: 'suite_tt_auditoria', code: 'TC03.5', title: 'Filtrar por categoria (User Stories)', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Filtrar por categoria "User Stories"', e: 'O filtro é aplicado' },
      { a: 'Verificar resultados', e: 'Apenas registros de User Stories são exibidos' },
    ],
    expected: 'Linhas exibidas pertencem à categoria "User Story".' },
  { suite: 'suite_tt_auditoria', code: 'TC03.6', title: 'Filtrar por categoria (Ações)', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Filtrar por categoria "Ações"', e: 'O filtro é aplicado' },
      { a: 'Verificar resultados', e: 'Apenas registros de Ações são exibidos' },
    ],
    expected: 'Linhas exibidas pertencem à categoria "Ação".' },
  { suite: 'suite_tt_auditoria', code: 'TC03.7', title: 'Filtrar por categoria (Tipos de Atividade)', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Filtrar por categoria "Tipos de Atividade"', e: 'O filtro é aplicado' },
      { a: 'Verificar resultados', e: 'Apenas registros de Tipos de Atividade são exibidos' },
    ],
    expected: 'Linhas exibidas pertencem à categoria "Tipo de Atividade".' },
  { suite: 'suite_tt_auditoria', code: 'TC03.8', title: 'Filtrar por categoria (Clientes)', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Filtrar por categoria "Clientes"', e: 'O filtro é aplicado' },
      { a: 'Verificar resultados', e: 'Apenas registros de Clientes são exibidos' },
    ],
    expected: 'Linhas exibidas pertencem à categoria "Cliente".' },
  { suite: 'suite_tt_auditoria', code: 'TC03.9', title: 'Filtrar por categoria (Squads)', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Filtrar por categoria "Squads"', e: 'O filtro é aplicado' },
      { a: 'Verificar resultados', e: 'Apenas registros de Squads são exibidos' },
    ],
    expected: 'Linhas exibidas pertencem à categoria "Squad".' },
  { suite: 'suite_tt_auditoria', code: 'TC04', title: 'Filtrar por tipo de ação (Criação)', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Filtrar por tipo de ação "Criação"', e: 'O filtro é aplicado' },
      { a: 'Verificar resultados', e: 'Apenas registros de Criação são exibidos' },
    ],
    expected: 'Todas as linhas exibidas têm Tipo = "Criação".' },
  { suite: 'suite_tt_auditoria', code: 'TC0500', title: 'Filtrar por tipo de ação (Atualização)', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Filtrar por tipo de ação "Atualização"', e: 'O filtro é aplicado' },
      { a: 'Verificar resultados', e: 'Apenas registros de Atualização são exibidos' },
    ],
    expected: 'Todas as linhas exibidas têm Tipo = "Atualização".' },
  { suite: 'suite_tt_auditoria', code: 'TC05', title: 'Filtrar por tipo de ação (Exclusão)', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Filtrar por tipo de ação "Exclusão"', e: 'O filtro é aplicado' },
      { a: 'Verificar resultados', e: 'Apenas registros de Exclusão são exibidos' },
    ],
    expected: 'Todas as linhas exibidas têm Tipo = "Exclusão".' },
  { suite: 'suite_tt_auditoria', code: 'TC06', title: 'Filtrar por intervalo de datas', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Aplicar intervalo de datas', e: 'A busca é filtrada' },
      { a: 'Verificar resultados', e: 'As datas exibidas estão dentro do intervalo' },
    ],
    expected: 'Linhas exibidas têm datas dentro do intervalo definido.' },
  { suite: 'suite_tt_auditoria', code: 'TC07', title: 'Aplicar múltiplos filtros', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Aplicar filtros por entidade e tipo de ação', e: 'Os filtros são aplicados' },
      { a: 'Verificar resultados', e: 'Apenas registros que atendem a ambos os filtros são exibidos' },
    ],
    expected: 'Resultados apresentam Tipo = "Exclusão" e Categoria = "Produto".' },
  { suite: 'suite_tt_auditoria', code: 'TC08', title: 'Limpar filtros restaura listagem completa', pri: M,
    tags: ['auditoria', 'filtro'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Aplicar filtros', e: 'A lista é filtrada' },
      { a: 'Limpar filtros', e: 'Os filtros são removidos' },
      { a: 'Verificar resultados', e: 'A listagem completa é exibida' },
    ],
    expected: 'A listagem volta ao estado completo após limpar filtros.' },
  { suite: 'suite_tt_auditoria', code: 'TC10', title: 'Paginação - Ir para próxima página', pri: M,
    tags: ['auditoria', 'paginacao'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Ir para a próxima página', e: 'A página de resultados muda' },
      { a: 'Verificar resultados', e: 'Novos registros são exibidos' },
    ],
    expected: 'A página muda com sucesso. Há registros na nova página.' },
  { suite: 'suite_tt_auditoria', code: 'TC12', title: 'Mudar tamanho de página para 25', pri: M,
    tags: ['auditoria', 'paginacao'], by: 'seed_qa',
    pre: 'Usuário autenticado.',
    steps: [
      { a: 'Alterar tamanho da página para 25', e: 'A página é atualizada' },
      { a: 'Verificar resultados', e: 'No máximo 25 linhas são exibidas' },
    ],
    expected: 'A listagem exibe até 25 linhas.' },
];

/* ── Geração do SQL ── */
const caseId = (c, i) => `case_tt_${String(i + 1).padStart(3, '0')}`;

const suiteValues = suites
  .map((s, i) => `  ('${s.id}', '${PROJECT_ID}', ${s.parent ? `'${s.parent}'` : 'null'}, '${sq(s.name)}', ${i}, '${CREATED_AT}')`)
  .join(',\n');

const caseValues = cases.map((c, i) => {
  const steps = JSON.stringify(c.steps.map((s) => ({ action: s.a, expected: s.e })));
  const tags = `array[${c.tags.map((t) => `'${sq(t)}'`).join(',')}]`;
  const title = c.title;
  return `  (
    '${caseId(c, i)}', '${c.suite}', '${PROJECT_ID}',
    '${sq(title)}', 'automated', '${c.pri}', 'active',
    '${sq(c.pre)}',
    '${sq(steps)}'::jsonb,
    '${sq(c.expected)}',
    ${tags},
    '{}'::jsonb,
    '${c.by}', '${CREATED_AT}', null
  )`;
}).join(',\n');

const sql = `-- ═══════════════════════════════════════════════════════════════════════════
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
  ('${PROJECT_ID}', 'TalentTrack', 'Backoffice TalentTrack (Miketec_QA_TalentTrack): autenticação, gestão de usuários, configurações de entidades, referências, user stories, lançamentos de horas e auditoria. Casos de teste automatizados.', 'seed_admin', '${CREATED_AT}')
on conflict (id) do nothing;

-- ── Rebuild: limpa o estado antigo do projeto (casos antes das suítes p/ FK) ──
delete from public.qa_test_cases  where project_id = '${PROJECT_ID}';
delete from public.qa_test_suites where project_id = '${PROJECT_ID}';

-- ── Suítes (hierárquicas) ─────────────────────────────────────────────────────
insert into public.qa_test_suites (id, project_id, parent_id, name, "order", created_at) values
${suiteValues}
on conflict (id) do nothing;

-- ── Casos de teste ─────────────────────────────────────────────────────────
insert into public.qa_test_cases
  (id, suite_id, project_id, title, type, priority, status, preconditions, steps, expected_result, tags, custom_fields, created_by, created_at, updated_at) values
${caseValues}
on conflict (id) do nothing;
`;

const out = 'supabase/migrations/20260604120000_seed_qa_talenttrack.sql';
writeFileSync(out, sql, 'utf8');
console.log(`✅ Gerado: ${out}`);
console.log(`   • 1 projeto, ${suites.length} suítes, ${cases.length} casos.`);
