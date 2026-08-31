/// Qual ambiente esta aba está servindo.
///
/// O Diário de Obras é uma experiência própria — Mobile First, para uso em
/// campo — mas NÃO é uma segunda aplicação: mesmo bundle, mesma API, mesmo
/// banco, mesma sessão. O que muda é qual árvore de rotas o React monta, e
/// isso é decidido aqui, no boot, a partir do endereço.
///
/// Duas portas de entrada, de propósito:
///
///   1. **Subdomínio** (`diario.gestaoeds.com.br`) — a forma de produção. O
///      nginx já responde a qualquer host (`server_name _`), então publicar o
///      Diário é apontar um registro DNS para a MESMA stack. Não há segunda
///      imagem, segundo deploy nem segundo build.
///   2. **Prefixo `/diario`** — a rota de escape. Serve para testar em
///      máquina local sem mexer no `/etc/hosts`, para abrir o Diário de um
///      desktop já logado no ERP e para qualquer ambiente onde criar um
///      subdomínio (um túnel temporário, uma preview) não seja prático.
///
/// A alternativa que NÃO foi seguida: um app Vite separado em `apps/diario`.
/// Duplicaria build, deploy, provider de autenticação e cliente HTTP para
/// entregar exatamente o mesmo resultado ao usuário — e a primeira correção
/// no `api-client` já teria que ser feita duas vezes.
export type AppMode = 'erp' | 'diario';

const DIARIO_HOST_PREFIX = 'diario.';

/// Prefixo da rota de escape. Vira o `basename` do router quando o Diário é
/// aberto por caminho em vez de subdomínio, então todos os `<Link to="/obras">`
/// do Diário continuam escritos como se estivessem na raiz.
export const DIARIO_PATH_PREFIX = '/diario';

export interface AppEnvironment {
  mode: AppMode;
  basename: string;
}

export function resolveAppEnvironment(
  location: Pick<Location, 'hostname' | 'pathname'> = window.location,
): AppEnvironment {
  if (location.hostname.startsWith(DIARIO_HOST_PREFIX)) {
    return { mode: 'diario', basename: '/' };
  }

  if (
    location.pathname === DIARIO_PATH_PREFIX ||
    location.pathname.startsWith(`${DIARIO_PATH_PREFIX}/`)
  ) {
    return { mode: 'diario', basename: DIARIO_PATH_PREFIX };
  }

  return { mode: 'erp', basename: '/' };
}
