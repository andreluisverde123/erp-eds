-- Extensão usada pelos índices de busca por texto (`gin_trgm_ops`).
-- Fica numa migration separada da criação dos índices porque o Prisma não
-- gerencia extensões: se ela viesse junto, todo `migrate dev` seguinte
-- acusaria drift.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
