import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  aplicarMarca,
  aplicarNoDocumento,
  esquecerDaBiblioteca,
  guardarNaBiblioteca,
  inscrever,
  lerBiblioteca,
  lerMarcaAtiva,
  marcaAtiva,
  reiniciarParaTeste,
  type MarcaDemo,
} from './demo-brand';

const LETS: MarcaDemo = {
  id: 'lets',
  rotulo: 'Lets Engenharia',
  erpName: 'ERP Lets',
  companyName: 'Lets Engenharia',
  primary: '#545454',
  logo: 'data:image/png;base64,iVBORw0KGgo=',
};

const OUTRA: MarcaDemo = { ...LETS, id: 'outra', rotulo: 'Alfa Construções', primary: '#00b894' };

const corDaRaiz = (token: string) => document.documentElement.style.getPropertyValue(token);

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('style');
  reiniciarParaTeste();
});

describe('Pintar o documento com a marca', () => {
  it('a cor do cliente entra nos tokens do tema', () => {
    aplicarMarca(LETS);

    expect(corDaRaiz('--primary')).toBe('#545454');
    expect(corDaRaiz('--sidebar-primary')).toBe('#545454');
    expect(corDaRaiz('--ring')).toBe('#545454');
  });

  it('voltar para a EDS LIMPA os tokens em vez de reescrevê-los', () => {
    // A distinção importa: a cor da EDS mora em `globals.css` e nunca sai de
    // lá. Removendo a propriedade inline, o valor da folha volta a valer
    // sozinho — não é preciso guardar em canto nenhum qual era a cor original,
    // e uma futura mudança de marca da EDS não deixa este módulo desatualizado.
    aplicarMarca(LETS);
    aplicarMarca(null);

    expect(corDaRaiz('--primary')).toBe('');
    expect(corDaRaiz('--pending')).toBe('');
  });

  it('o logo do splash troca junto', () => {
    // O splash do `index.html` já está na tela antes de o React montar. Sem
    // isto, a demonstração abre com a assinatura da EDS e troca em seguida.
    document.body.innerHTML = '<div id="app-splash"><img src="/logo-eds.svg" alt="" /></div>';

    aplicarNoDocumento(LETS);
    expect(document.querySelector('img')!.getAttribute('src')).toBe(LETS.logo);

    aplicarNoDocumento(null);
    expect(document.querySelector('img')!.getAttribute('src')).toBe('/logo-eds.svg');
  });
});

describe('A marca sobrevive ao recarregamento', () => {
  it('o que foi aplicado volta na próxima abertura', () => {
    aplicarMarca(LETS);

    // `reiniciarParaTeste` esvazia a memória do módulo, que é o que uma
    // recarga da página faz.
    reiniciarParaTeste();

    expect(marcaAtiva()).toEqual(LETS);
  });

  it('voltar para a EDS não deixa resíduo guardado', () => {
    aplicarMarca(LETS);
    aplicarMarca(null);
    reiniciarParaTeste();

    expect(marcaAtiva()).toBeNull();
  });

  it('conteúdo estragado é ignorado, e o sistema abre como EDS', () => {
    // Editado à mão no console, ou sobra de um formato anterior. Aplicar meia
    // marca seria pior que não aplicar nenhuma.
    window.localStorage.setItem('eds.demo-brand.ativa', '{"id":"x","primary":"não é cor"}');

    expect(lerMarcaAtiva()).toBeNull();
  });

  it('JSON inválido não derruba a abertura', () => {
    window.localStorage.setItem('eds.demo-brand.ativa', '{{{');

    expect(lerMarcaAtiva()).toBeNull();
  });
});

describe('Biblioteca de marcas desta máquina', () => {
  it('guarda e devolve em ordem de rótulo', () => {
    guardarNaBiblioteca(LETS);
    guardarNaBiblioteca(OUTRA);

    expect(lerBiblioteca().map((m) => m.rotulo)).toEqual(['Alfa Construções', 'Lets Engenharia']);
  });

  it('salvar de novo SUBSTITUI, não duplica', () => {
    // O painel salva a mesma marca várias vezes enquanto se acerta a cor.
    guardarNaBiblioteca(LETS);
    guardarNaBiblioteca({ ...LETS, primary: '#123456' });

    const guardadas = lerBiblioteca();
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0]!.primary).toBe('#123456');
  });

  it('excluir tira só a escolhida', () => {
    guardarNaBiblioteca(LETS);
    guardarNaBiblioteca(OUTRA);

    expect(esquecerDaBiblioteca('lets').map((m) => m.id)).toEqual(['outra']);
  });
});

describe('Quem está na tela é avisado', () => {
  it('a troca notifica os inscritos', () => {
    const ouvinte = vi.fn();
    const cancelar = inscrever(ouvinte);

    aplicarMarca(LETS);
    expect(ouvinte).toHaveBeenCalledTimes(1);

    cancelar();
    aplicarMarca(null);
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it('a leitura devolve a MESMA referência enquanto nada muda', () => {
    // `useSyncExternalStore` compara por identidade e entra em laço infinito de
    // re-render se cada chamada devolver um objeto novo.
    aplicarMarca(LETS);

    expect(marcaAtiva()).toBe(marcaAtiva());
  });
});
