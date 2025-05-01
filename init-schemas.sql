-- Criar os esquemas necessários
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'typebot_scheme') THEN
    CREATE SCHEMA typebot_scheme;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'api_scheme') THEN
    CREATE SCHEMA api_scheme;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'evolution_api') THEN
    CREATE SCHEMA evolution_api;
  END IF;
END $$;
