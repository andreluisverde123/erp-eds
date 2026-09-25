-- Programação de pagamentos: a diretoria libera, conta a conta, o que o
-- Financeiro pode pagar na semana. Nulo = não liberada. Só colunas novas e
-- anuláveis: nenhuma conta existente muda de situação.
ALTER TABLE "AccountPayable"
  ADD COLUMN "approvedForPaymentAt"   TIMESTAMP(3),
  ADD COLUMN "approvedForPaymentById" UUID,
  -- Quem liberou e quando andam juntos. O usuário pode sumir depois (SET NULL
  -- abaixo), por isso a regra é só "sem data não há quem".
  ADD CONSTRAINT "AccountPayable_approval_has_date"
    CHECK ("approvedForPaymentById" IS NULL OR "approvedForPaymentAt" IS NOT NULL);

ALTER TABLE "AccountPayable"
  ADD CONSTRAINT "AccountPayable_approvedForPaymentById_fkey"
  FOREIGN KEY ("approvedForPaymentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
