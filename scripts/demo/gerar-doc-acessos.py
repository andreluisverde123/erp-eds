"""Gera o documento de acessos do ambiente de demonstração (.docx).

Uso:
    python3 scripts/gerar-doc-acessos.py

Sem dependências: um .docx é um zip com XML dentro, e é isso que o script
monta. Atualize URL e SENHA abaixo sempre que o túnel for reiniciado — a URL
do Cloudflare Quick Tunnel muda a cada restart do container.

O arquivo sai na raiz do repositório; copie para a Área de Trabalho se for
enviar ao cliente.
"""
import zipfile
from html import escape

URL = "https://earth-garden-arising-pulse.trycloudflare.com"
SENHA = "EdsDemo@2026"

CREDENCIAIS = [
    ("Administrador", "admin@eds.app",
     "Acesso total. Único com Configurações: usuários, perfis, empresa, auditoria e lixeira. Aprova compras e pagamentos acima da alçada."),
    ("Diretoria", "diretoria@eds.app",
     "Visão executiva: enxerga e edita os cinco módulos e aprova alçadas, mas não acessa Configurações."),
    ("Engenharia", "engenharia@eds.app",
     "Edita Obras, Centros de Custo e Terceiros. Acompanha as solicitações de compra da obra, sem poder alterá-las."),
    ("Compras", "compras@eds.app",
     "Edita Solicitações, Ordens de Compra e Fornecedores. Consulta Obras para escolher onde o material será usado."),
    ("Financeiro", "financeiro@eds.app",
     "Edita Notas Fiscais, Contas a Pagar e Pagamentos. Consulta as Ordens de Compra que originam as notas."),
    ("RH", "rh@eds.app",
     "Edita Funcionários, Ponto, Produção e Holerites. Consulta Obras para alocar equipe."),
]

OBSERVACOES = [
    "A senha é a mesma para os seis acessos.",
    "O menu lateral muda conforme o perfil: cada um vê apenas os módulos que pode abrir. Só o Administrador enxerga Configurações.",
    "Todos podem consultar o que precisam para trabalhar, mas só alteram o próprio módulo. Ao tentar editar fora da sua área, o sistema recusa a ação com uma mensagem de permissão — esse é o comportamento esperado.",
    "O ambiente já vem com dados de demonstração: 3 obras, 2 fornecedores, 3 solicitações, 1 ordem de compra, 1 nota fiscal, 3 funcionários e 2 terceiros.",
    "É um ambiente de testes. Pode cadastrar, editar e excluir à vontade — nada aqui é real.",
    "O endereço é temporário e pode mudar. Se o link parar de responder, peça um novo.",
]


def p(text, bold=False, size=22, space_after=120, color=None):
    runprops = "<w:rPr>"
    if bold:
        runprops += "<w:b/>"
    if color:
        runprops += f'<w:color w:val="{color}"/>'
    runprops += f'<w:sz w:val="{size}"/></w:rPr>'
    return (
        f'<w:p><w:pPr><w:spacing w:after="{space_after}"/></w:pPr>'
        f"<w:r>{runprops}<w:t xml:space=\"preserve\">{escape(text)}</w:t></w:r></w:p>"
    )


def cell(text, bold=False, width=2400, shade=None):
    shading = f'<w:shd w:val="clear" w:fill="{shade}"/>' if shade else ""
    return (
        f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{shading}</w:tcPr>'
        f'<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr>{"<w:b/>" if bold else ""}'
        f'<w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p></w:tc>'
    )


rows = [
    "<w:tr>" + cell("Perfil", True, 1800, "DB027D") + cell("E-mail", True, 2600, "DB027D")
    + cell("O que esse perfil faz", True, 5000, "DB027D") + "</w:tr>"
]
for perfil, email, desc in CREDENCIAIS:
    rows.append("<w:tr>" + cell(perfil, True, 1800) + cell(email, False, 2600) + cell(desc, False, 5000) + "</w:tr>")

table = (
    '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9400" w:type="dxa"/>'
    '<w:tblBorders>'
    + "".join(
        f'<w:{side} w:val="single" w:sz="4" w:space="0" w:color="D4D4D8"/>'
        for side in ("top", "left", "bottom", "right", "insideH", "insideV")
    )
    + "</w:tblBorders></w:tblPr>" + "".join(rows) + "</w:tbl>"
)

body = (
    p("EDS — Ambiente de demonstração", True, 36, 80)
    + p("Acessos para teste por perfil", False, 24, 300, "666666")
    + p("Endereço", True, 26, 60)
    + p(URL, False, 24, 240, "0563C1")
    + p("Senha (a mesma para todos)", True, 26, 60)
    + p(SENHA, True, 28, 300)
    + p("Credenciais", True, 26, 120)
    + table
    + p("", False, 20, 200)
    + p("Observações", True, 26, 120)
    + "".join(p(f"•  {o}", False, 20, 100) for o in OBSERVACOES)
)

document = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    f"<w:body>{body}<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/>"
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>'
)

content_types = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    "</Types>"
)

rels = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    "</Relationships>"
)

out = "/Users/andreverde/eds/EDS-acessos-demonstracao.docx"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", rels)
    z.writestr("word/document.xml", document)

print("gerado:", out)
