/* Runner de migration contra o Postgres do Supabase (sessão/pooler).
   A senha do banco é lida de supabase/.temp/db-password.txt (NÃO commitar).
   Host/usuário do pooler vêm de env vars (SUPABASE_DB_HOST / SUPABASE_DB_USER).
   Uso: node scripts/apply-migration.mjs <arquivo.sql> */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const sqlFile = process.argv[2] || 'supabase/migrations/20260603190000_create_qa_test_management.sql';
const pwPath = 'supabase/.temp/db-password.txt';

let password;
try {
  password = readFileSync(pwPath, 'utf8').trim();
} catch {
  console.error(`\n❌ Senha não encontrada. Crie o arquivo ${pwPath} com a senha do banco numa linha.\n   (Dashboard → Project Settings → Database → Database password)\n`);
  process.exit(1);
}
if (!password) { console.error('❌ Arquivo de senha vazio.'); process.exit(1); }

const host = process.env.SUPABASE_DB_HOST;
const user = process.env.SUPABASE_DB_USER;
if (!host || !user) {
  console.error('❌ Defina SUPABASE_DB_HOST e SUPABASE_DB_USER (Dashboard → Project Settings → Database → Connection pooling).');
  process.exit(1);
}

const sql = readFileSync(sqlFile, 'utf8');

// Pooler de sessão (porta 5432) — suporta DDL.
const client = new Client({
  host,
  port: 5432,
  user,
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

const run = async () => {
  console.log('→ Conectando ao Supabase…');
  await client.connect();
  console.log('→ Aplicando', sqlFile, `(${sql.length} chars)…`);
  await client.query(sql);
  // Verifica as tabelas criadas
  const { rows } = await client.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_name like 'qa_test_%' or table_name in
       ('qa_milestones','qa_requirements','qa_defects','qa_exploratory_sessions','qa_test_case_requirements')
     order by table_name;`,
  );
  console.log('✅ Migration aplicada. Tabelas presentes:');
  rows.forEach((r) => console.log('   •', r.table_name));
  // Força reload do schema cache do PostgREST
  await client.query(`notify pgrst, 'reload schema';`);
  console.log("→ Schema cache do PostgREST recarregado.");
  await client.end();
};

run().catch(async (e) => {
  console.error('\n❌ ERRO ao aplicar migration:\n', e.message);
  try { await client.end(); } catch { /* noop */ }
  process.exit(1);
});
