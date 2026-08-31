#!/bin/sh
# Ajusta o dono da pasta de uploads e SÓ ENTÃO baixa o privilégio para `node`.
#
# Por que isto existe: um volume montado entra com o dono do host (root), por
# cima do diretório que a imagem criou para o `node`. O `chown` do build vale
# até o mount acontecer, e depois não vale mais — a pasta que era do `node`
# volta a ser do root, e o processo não consegue nem criar a primeira subpasta.
# O sintoma no Railway era `EACCES: permission denied, mkdir` em todo upload,
# com o resto da API funcionando.
#
# Rodar o processo inteiro como root resolveria e é o que muita imagem faz.
# Aqui não: root é necessário só para o `chown`, que leva um instante no boot.
# `setpriv` faz a troca com `exec`, sem processo intermediário, então o SIGTERM
# do orquestrador continua chegando ao Node — que é o que permite o
# `enableShutdownHooks()` fechar o Prisma limpo. Ele já vem no `node:22-slim`;
# `gosu` exigiria instalar pacote.
set -e

# Mesmo padrão que o `LocalStorageDriver` usa: relativo ao diretório de
# trabalho, com `uploads` por omissão. Os dois precisam concordar — se
# divergirem, o chown acerta uma pasta e a aplicação escreve em outra.
STORAGE_ROOT="${STORAGE_LOCAL_ROOT:-uploads}"
case "$STORAGE_ROOT" in
  /*) STORAGE_DIR="$STORAGE_ROOT" ;;
   *) STORAGE_DIR="$PWD/$STORAGE_ROOT" ;;
esac

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$STORAGE_DIR"

  # `chown -R` só quando o dono está errado. Num volume com muitos arquivos, a
  # travessia recursiva a cada boot custaria tempo de partida sem motivo.
  if [ "$(stat -c %u "$STORAGE_DIR")" != "1000" ]; then
    chown -R node:node "$STORAGE_DIR" || {
      echo "AVISO: não foi possível ajustar o dono de $STORAGE_DIR." >&2
      echo "AVISO: uploads vão falhar com 503 até isto ser resolvido." >&2
    }
  fi

  exec setpriv --reuid=node --regid=node --init-groups -- "$@"
fi

# Já sem privilégio (imagem rodada com --user, por exemplo): nada a ajustar.
exec "$@"
