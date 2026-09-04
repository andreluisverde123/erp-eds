import { describe, expect, it } from 'vitest';

import { getRequestDisplayStatus } from './purchase-request-status';

/// A ETIQUETA DA SOLICITAÇÃO.
///
/// Relato que originou isto, nas palavras do usuário: "às vezes nem tudo que
/// está na solicitação foi comprado, e a tag 'Aprovada' confunde, porque
/// parece que já foi comprado tudo e às vezes ainda falta coisa — seria uma
/// compra ainda em andamento".
///
/// "Aprovada" descreve a DECISÃO, não a COMPRA. Enquanto sobra item pendente,
/// a solicitação não está parada nem concluída: está em andamento.
describe('Etiqueta da solicitação', () => {
  describe('aprovada, com compra em andamento', () => {
    it('parte comprada deixa de dizer "Aprovada"', () => {
      expect(getRequestDisplayStatus('APPROVED', { status: 'PARTIAL' })).toEqual({
        label: 'Parcialmente atendida',
        variant: 'info',
      });
    });

    it('não usa verde — verde é o que fazia passar batido', () => {
      // Sobra trabalho a fazer. Pintar de `success` numa lista é justamente o
      // que levava a pessoa a achar que aquela linha estava resolvida.
      const { variant } = getRequestDisplayStatus('APPROVED', { status: 'PARTIAL' });

      expect(variant).not.toBe('success');
    });

    it('tudo comprado vira "Atendida"', () => {
      // A decisão saiu de cena: o que importa é que a necessidade foi suprida.
      expect(getRequestDisplayStatus('APPROVED', { status: 'FULFILLED' })).toEqual({
        label: 'Atendida',
        variant: 'success',
      });
    });

    it('aprovada e nada comprado CONTINUA "Aprovada"', () => {
      // Aqui a palavra está certa, e trocá-la esconderia que a compra sequer
      // começou.
      expect(getRequestDisplayStatus('APPROVED', { status: 'PENDING' })).toEqual({
        label: 'Aprovada',
        variant: 'success',
      });
    });
  });

  describe('antes da aprovação nada muda', () => {
    it('os demais status seguem com o rótulo de sempre', () => {
      // Nenhuma ordem pode existir antes de APPROVED, então "Pendente" e "Em
      // Cotação" já dizem a verdade inteira.
      expect(getRequestDisplayStatus('DRAFT', { status: 'PENDING' }).label).toBe('Rascunho');
      expect(getRequestDisplayStatus('PENDING', { status: 'PENDING' }).label).toBe('Pendente');
      expect(getRequestDisplayStatus('QUOTING', { status: 'PENDING' }).label).toBe('Em Cotação');
      expect(getRequestDisplayStatus('CANCELLED', { status: 'PENDING' }).label).toBe('Cancelada');
    });

    it('cancelada não é reescrita nem com itens comprados', () => {
      // Uma solicitação cancelada depois de uma compra parcial continua
      // cancelada — o cancelamento é terminal (regra C-2).
      expect(getRequestDisplayStatus('CANCELLED', { status: 'PARTIAL' })).toEqual({
        label: 'Cancelada',
        variant: 'destructive',
      });
    });
  });

  describe('sem o atendimento em mãos', () => {
    it('volta a ser a etiqueta de sempre, em vez de quebrar', () => {
      // Uma tela que só tenha o status continua funcionando.
      expect(getRequestDisplayStatus('APPROVED')).toEqual({
        label: 'Aprovada',
        variant: 'success',
      });
    });
  });
});
