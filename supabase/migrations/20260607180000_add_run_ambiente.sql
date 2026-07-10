-- Adiciona campos de contexto de execução à tabela de test runs
ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS ambiente TEXT;
ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS versao_backoffice TEXT;
ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS versao_b2b TEXT;
