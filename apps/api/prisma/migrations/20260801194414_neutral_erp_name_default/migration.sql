-- O padrão de `erpName` era o nome de um cliente específico, então toda
-- empresa nova nascia batizada com a marca de outra. O produto passa a nascer
-- neutro; cada empresa renomeia em Configurações → Sistema.
--
-- Linhas existentes NÃO são tocadas de propósito: quem já renomeou (ou já é
-- aquele cliente) continua com o nome que escolheu.
ALTER TABLE "SystemSettings" ALTER COLUMN "erpName" SET DEFAULT 'ERP';
