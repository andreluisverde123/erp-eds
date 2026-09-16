import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ALTURA_LOGO_PADRAO,
  alturaDoLogo,
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
    // isto, a demonstração abre com a assinatura da instalação e troca em seguida.
    document.body.innerHTML = '<div id="app-splash"><img src="/brand/logo.svg" alt="" /></div>';

    aplicarNoDocumento(LETS);
    expect(document.querySelector('img')!.getAttribute('src')).toBe(LETS.logo);

    aplicarNoDocumento(null);
    expect(document.querySelector('img')!.getAttribute('src')).toBe('/brand/logo.svg');
  });
});

/// A caixa do logo na barra lateral tem 20px de altura por 130px de largura —
/// medidas da arte da EDS, que é uma faixa horizontal. Logo de construtora
/// quase sempre é empilhado (símbolo em cima, nome embaixo) e nessa caixa vira
/// um borrão recortado. Por isso a altura é um controle, e não uma constante.
describe('Tamanho do logo', () => {
  it('sem escolha, usa uma altura maior que a da assinatura da EDS', () => {
    expect(alturaDoLogo({ ...LETS, alturaLogo: undefined })).toBe(ALTURA_LOGO_PADRAO);
    expect(ALTURA_LOGO_PADRAO).toBeGreaterThan(20);
  });

  it('a altura escolhida vira medida da caixa', () => {
    aplicarMarca({ ...LETS, alturaLogo: 44 });

    expect(corDaRaiz('--marca-altura')).toBe('44px');
    // A largura também abre: 130px é medida da assinatura da EDS e cortaria um
    // logotipo mais largo pela metade.
    expect(corDaRaiz('--marca-largura')).not.toBe('');
  });

  it('marca SEM logo não mexe na caixa', () => {
    // Trocar só a cor e os nomes, mantendo a assinatura da EDS: a caixa tem que
    // continuar com as medidas para as quais ela foi desenhada.
    aplicarMarca({ ...LETS, logo: null, alturaLogo: 44 });

    expect(corDaRaiz('--marca-altura')).toBe('');
    expect(corDaRaiz('--marca-largura')).toBe('');
  });

  it('voltar para a EDS devolve a caixa original', () => {
    aplicarMarca({ ...LETS, alturaLogo: 44 });
    aplicarMarca(null);

    expect(corDaRaiz('--marca-altura')).toBe('');
  });

  it('marca guardada antes deste campo existir continua válida', () => {
    // Quem já tinha salvo uma marca não pode perdê-la porque um campo novo
    // apareceu depois.
    const { alturaLogo: _, ...semAltura } = { ...LETS, alturaLogo: 40 };
    window.localStorage.setItem('eds.demo-brand.ativa', JSON.stringify(semAltura));

    expect(lerMarcaAtiva()).not.toBeNull();
    expect(alturaDoLogo(lerMarcaAtiva())).toBe(ALTURA_LOGO_PADRAO);
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
