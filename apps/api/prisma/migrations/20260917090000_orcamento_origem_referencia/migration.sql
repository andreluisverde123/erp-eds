-- ORC-05 (1/2): um valor novo de enum, sozinho nesta migration.
--
-- O Postgres não deixa USAR um valor de enum na mesma transação que o criou
-- ("unsafe use of new value"), e a migration seguinte usa 'REFERENCE' no CHECK
-- de origem do item. O Prisma aplica cada migration na própria transação.
ALTER TYPE "BudgetItemSource" ADD VALUE IF NOT EXISTS 'REFERENCE';
