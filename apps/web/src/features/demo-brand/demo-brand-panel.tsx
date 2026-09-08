import { useEffect, useRef, useState } from 'react';

import { APP_NAME, COMPANY_NAME } from '@/config/company';

import { normalizarHex } from './brand-tokens';
import {
  aplicarMarca,
  esquecerDaBiblioteca,
  guardarNaBiblioteca,
  lerBiblioteca,
  LIMITE_LOGO_BYTES,
  type MarcaDemo,
} from './demo-brand';
import { useMarcaDemo } from './use-demo-brand';

/// Painel de marca de demonstração.
///
/// Todo o visual aqui é NEUTRO e fixo — cinzas literais, nunca os tokens do
/// sistema. Um painel pintado com `bg-primary` mudaria de cor junto com o que
/// ele está controlando, e ficaria ilegível exatamente na marca clara em que
/// mais se precisa dele. Ele fica por fora do tema de propósito.
///
/// Sem componentes de `@repo/ui` pela mesma razão, e por uma segunda: este é um
/// instrumento de bastidor, não uma tela do produto. Não deve aparecer na
/// biblioteca de componentes nem herdar mudanças feitas para o produto.

const COR_PADRAO = '#ed2124';

function marcaEmBranco(): MarcaDemo {
  return {
    id: crypto.randomUUID(),
    rotulo: 'Nova marca',
    erpName: APP_NAME,
    companyName: COMPANY_NAME,
    primary: COR_PADRAO,
    logo: null,
  };
}

async function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(arquivo);
  });
}

export function DemoBrandPanel() {
  const marca = useMarcaDemo();
  const [aberto, setAberto] = useState(false);
  // Esconder o botão inteiro tem um motivo prático: na hora de compartilhar a
  // tela ou tirar print, um widget flutuante no canto denuncia que aquilo é um
  // ambiente de demonstração. Ctrl+Shift+M traz de volta.
  const [oculto, setOculto] = useState(false);
  const [biblioteca, setBiblioteca] = useState<MarcaDemo[]>(() => lerBiblioteca());
  // Rascunho do campo de hex, e não uma cópia da cor aplicada: "#5" é um passo
  // legítimo no caminho até "#545454", e o campo precisa mostrar o que foi
  // digitado enquanto a cor do sistema ainda não mudou. `null` significa "nada
  // sendo digitado" — aí o campo espelha a cor em uso, e trocar de marca pela
  // lista aparece no campo sem efeito nenhum sincronizando as duas coisas.
  const [rascunhoHex, setRascunhoHex] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.ctrlKey && evento.shiftKey && evento.key.toLowerCase() === 'm') {
        evento.preventDefault();
        setOculto((antes) => !antes);
      }
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  function mudar(parcial: Partial<MarcaDemo>) {
    aplicarMarca({ ...(marca ?? marcaEmBranco()), ...parcial });
    setAviso(null);
  }

  /// Trocar a marca inteira (lista da biblioteca, "Voltar para EDS") descarta o
  /// que estava sendo digitado: o campo volta a espelhar a cor em uso.
  function trocarMarca(nova: MarcaDemo | null) {
    setRascunhoHex(null);
    aplicarMarca(nova);
    setAviso(null);
  }

  async function aoEscolherLogo(arquivo: File | undefined) {
    if (!arquivo) return;
    const dataUrl = await lerComoDataUrl(arquivo);
    if (dataUrl.length > LIMITE_LOGO_BYTES) {
      setAviso('Logo grande demais. Exporte em até ~1 MB antes de subir.');
      return;
    }
    mudar({ logo: dataUrl });
  }

  if (oculto) return null;

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Marca de demonstração (Ctrl+Shift+M esconde)"
        className="fixed bottom-3 right-3 z-[9999] flex items-center gap-2 rounded-full border border-neutral-300 bg-white/90 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-lg backdrop-blur transition hover:bg-white"
      >
        <span
          className="size-3 rounded-full border border-black/10"
          style={{ background: marca?.primary ?? COR_PADRAO }}
        />
        {marca ? marca.rotulo : 'Marca'}
      </button>
    );
  }

  const emUso = marca ?? marcaEmBranco();

  return (
    <div className="fixed bottom-3 right-3 z-[9999] w-[19rem] rounded-lg border border-neutral-300 bg-white text-neutral-800 shadow-2xl">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Marca de demonstração
        </span>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded px-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          aria-label="Fechar painel"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-3 p-3 text-sm">
        {biblioteca.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Salvas nesta máquina</span>
            <div className="flex gap-1">
              <select
                className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                value={marca?.id ?? ''}
                onChange={(e) => {
                  const escolhida = biblioteca.find((m) => m.id === e.target.value);
                  trocarMarca(escolhida ?? null);
                }}
              >
                <option value="">EDS (padrão)</option>
                {biblioteca.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.rotulo}
                  </option>
                ))}
              </select>
              {marca && biblioteca.some((m) => m.id === marca.id) && (
                <button
                  type="button"
                  onClick={() => setBiblioteca(esquecerDaBiblioteca(marca.id))}
                  className="rounded border border-neutral-300 px-2 text-xs text-neutral-600 hover:bg-neutral-100"
                  title="Remover da biblioteca"
                >
                  Excluir
                </button>
              )}
            </div>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Cliente (rótulo)</span>
          <input
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
            value={emUso.rotulo}
            onChange={(e) => mudar({ rotulo: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Nome do sistema</span>
          <input
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
            value={emUso.erpName}
            onChange={(e) => mudar({ erpName: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Construtora</span>
          <input
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
            value={emUso.companyName}
            onChange={(e) => mudar({ companyName: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Cor da marca</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="size-8 cursor-pointer rounded border border-neutral-300 bg-white p-0.5"
              value={emUso.primary}
              onChange={(e) => {
                setRascunhoHex(null);
                mudar({ primary: e.target.value });
              }}
            />
            <input
              className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 font-mono text-sm"
              value={rascunhoHex ?? emUso.primary}
              onChange={(e) => {
                setRascunhoHex(e.target.value);
                const valida = normalizarHex(e.target.value);
                if (valida) mudar({ primary: valida });
              }}
              onBlur={() => setRascunhoHex(null)}
              placeholder="#545454"
            />
          </div>
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Logo</span>
          <div className="flex items-center gap-2">
            <div className="flex h-10 flex-1 items-center justify-center rounded border border-dashed border-neutral-300 bg-neutral-50 px-2">
              {emUso.logo ? (
                <img src={emUso.logo} alt={emUso.rotulo} className="max-h-8 w-auto max-w-full" />
              ) : (
                <span className="text-xs text-neutral-400">assinatura da EDS</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => arquivoRef.current?.click()}
              className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100"
            >
              Escolher
            </button>
            {emUso.logo && (
              <button
                type="button"
                onClick={() => mudar({ logo: null })}
                className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100"
              >
                Tirar
              </button>
            )}
          </div>
          <input
            ref={arquivoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void aoEscolherLogo(e.target.files?.[0]);
              // Permite reescolher o MESMO arquivo depois de trocá-lo no disco.
              e.target.value = '';
            }}
          />
        </div>

        {aviso && <p className="text-xs text-amber-700">{aviso}</p>}

        <div className="flex gap-2 border-t border-neutral-200 pt-3">
          <button
            type="button"
            onClick={() => setBiblioteca(guardarNaBiblioteca(emUso))}
            className="flex-1 rounded bg-neutral-800 px-2 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={() => trocarMarca(null)}
            className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-xs hover:bg-neutral-100"
          >
            Voltar para EDS
          </button>
        </div>

        <p className="text-[11px] leading-snug text-neutral-500">
          Vale para as telas. Os PDFs saem com o que estiver em{' '}
          <strong className="font-medium">Configurações → Empresa</strong> — suba lá o mesmo logo
          para os documentos combinarem.
        </p>
      </div>
    </div>
  );
}

export default DemoBrandPanel;
