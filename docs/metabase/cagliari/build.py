#!/usr/bin/env python3
"""
Compila `modelo.sql` + `cards.sql` em `standalone/`, um arquivo por card.

Existe porque o editor nativo do Metabase não roda DDL nem várias instruções:
colar um `CREATE VIEW` lá dá "Select statement did not produce a ResultSet".
Cada card precisa ser UM `SELECT` autossuficiente, então o build embute as
views de que ele depende como CTE no topo.

`standalone/` é GERADO. Nunca edite lá — edite `cards.sql` e rode isto.

    python3 docs/metabase/cagliari/build.py
"""
import json
import re
import sys
import pathlib

BASE = pathlib.Path(__file__).resolve().parent
SAIDA = BASE / "standalone"

# ---------------------------------------------------------------------
# O CONTRATO DE FILTROS
#
# Definido UMA vez, expandido em todo card que escreve `/*@filtros*/`.
# No protótipo anterior este bloco estava copiado em cada card, e as
# divergências entre as cópias eram a fonte dos cards que abriam vazios.
#
# Cada filtro é opcional de verdade — `[[...]]` só entra na query quando a
# pessoa preenche o campo. Nenhum deles tem default (só as datas têm), e
# isso é deliberado: o Metabase marca variável com default como
# `required: true`, o que faz o `[[AND ...]]` deixar de ser opcional e
# permite que dois filtros se anulem em silêncio, sem erro nenhum.
#
# Os filtros de lista aceitam VÁRIOS valores separados por vírgula:
# "APT-11, APT-12" ou "Soleira,Base shaft". O `btrim` absorve o espaço que
# a pessoa digita depois da vírgula.
# ---------------------------------------------------------------------
def _lista(coluna: str, variavel: str, cast: str = ""):
    """Filtro de N valores separados por vírgula, sobre uma coluna."""
    def montar(p: str) -> str:
        return (f"[[AND {p}{coluna} = ANY (SELECT btrim(v){cast} "
                f"FROM unnest(string_to_array({{{{{variavel}}}}}, ',')) v)]]")
    return montar


# Cada entrada recebe o prefixo de alias ("i." ou "") e devolve a cláusula.
# São funções, e não strings com `.format`, justamente porque o texto está
# cheio de `{{...}}` do Metabase — qualquer `.format` aqui comeria as chaves.
FILTROS = {
    # o checklist entra pelo ID: é estável, e é ele que identifica a frente
    "checklist": lambda p: f"[[AND {p}checklist_id = {{{{checklist_id}}}}]]",
    # as tags entram pelo RÓTULO, porque é o que uma pessoa digita.
    # `&&` = "o conjunto de tags da frente contém ALGUMA destas".
    "tags": lambda p: (f"[[AND {p}tags_arr && ARRAY(SELECT btrim(v) "
                       f"FROM unnest(string_to_array({{{{tags}}}}, ',')) v)]]"),
    "pavimentos": _lista("pavimento", "pavimentos", "::int"),
    "prumadas":   _lista("prumada",   "prumadas",   "::int"),
    "servicos":   _lista("servico",   "servicos"),
    "locais":     _lista("local",     "locais"),
}
ORDEM = ["checklist", "tags", "pavimentos", "prumadas", "servicos", "locais"]

VIEW_RE = re.compile(r"CREATE VIEW (\w+) AS\n(.*?);\n", re.S)


def sem_comentarios(sql: str) -> str:
    """O texto sem as linhas `--`, para procurar nomes de view com segurança."""
    return "\n".join(l for l in sql.split("\n") if not l.lstrip().startswith("--"))


def carregar_views() -> dict[str, str]:
    """As views de modelo.sql, com os comentários preservados no corpo.

    Um `;` dentro de um comentário cortaria a view no meio — já aconteceu. Por
    isso as FRONTEIRAS são achadas num texto com os comentários apagados (mesmo
    comprimento, para os offsets baterem), e o corpo é fatiado do original.
    """
    texto = (BASE / "modelo.sql").read_text()
    cego = "\n".join(
        (l[:l.index("--")] + " " * (len(l) - l.index("--"))) if "--" in l else l
        for l in texto.split("\n")
    )
    views: dict[str, str] = {}
    for m in VIEW_RE.finditer(cego):
        views[m.group(1)] = texto[m.start(2):m.end(2)]
    if not views:
        sys.exit("!! nenhuma view encontrada em modelo.sql")
    return views


def dependencias(sql: str, views: dict[str, str], vistas: list[str] | None = None):
    """As views que este SQL usa, em ordem topológica."""
    vistas = [] if vistas is None else vistas
    corpo = sem_comentarios(sql)
    for nome in views:
        if nome in vistas or not re.search(rf"\b{nome}\b", corpo):
            continue
        vistas.append(nome)
        dependencias(views[nome], views, vistas)
        vistas.remove(nome)
        vistas.append(nome)
    return vistas


# Views embutidas como CTE MATERIALIZED.
#
# Sem isso o Postgres inlina a CTE e empurra o corpo dela para dentro do
# join que a consome — e as subqueries por vistoria passam a rodar uma vez
# POR ITEM (6.586 em vez de 215). Medido: 3,5 s por card contra 0,2 s.
#
# Materializar também faz a CTE ser avaliada UMA vez quando o card a
# referencia várias (a pizza usa 3, a curva usa 4).
#
# O custo é perder o pushdown de predicado para dentro da CTE. Aqui isso
# não pesa: o fato inteiro tem 1800 linhas, e calcular tudo e filtrar
# depois sai mais barato que reavaliar o corpo a cada referência.
MATERIALIZAR = {"cag_vistoria", "cag_frente", "cag_item"}


def preambulo(sql: str, views: dict[str, str]) -> str:
    ordem = dependencias(sql, views)
    if not ordem:
        return ""
    def ind(b):
        return "\n".join("  " + l if l.strip() else l for l in b.strip().split("\n"))
    partes = []
    for n in ordem:
        mat = " MATERIALIZED" if n in MATERIALIZAR else ""
        partes.append(f"{n} AS{mat} (\n{ind(views[n])}\n)")
    return "WITH " + ",\n".join(partes)


def bloco_de_filtros(spec: str, prefixo: str) -> str:
    """`padrao -servicos -locais` -> o bloco com esses filtros de fora."""
    spec = (spec or "padrao").strip()
    if spec in ("-", "nenhum"):
        return ""
    fora = {t.lstrip("-") for t in spec.split() if t.startswith("-")}
    desconhecidos = fora - set(FILTROS)
    if desconhecidos:
        sys.exit(f"!! filtro desconhecido em `filtros:`: {', '.join(sorted(desconhecidos))}")
    p = f"{prefixo}." if prefixo else ""
    linhas = [FILTROS[n](p) for n in ORDEM if n not in fora]
    return "\n".join("  " + l for l in linhas)


def parse_cards(texto: str) -> list[dict]:
    cards = []
    for pedaco in re.split(r"\n(?=-- @card )", texto)[1:]:
        linhas = pedaco.split("\n")
        card = {"id": linhas[0].replace("-- @card ", "").strip(), "nota": []}
        corpo = []
        for l in linhas[1:]:
            if not corpo and l.lstrip().startswith("--"):
                m = re.match(r"--\s*(titulo|secao|viz|size|pergunta|filtros|pivot):\s*(.+)", l.strip())
                if m:
                    card[m.group(1)] = m.group(2).strip()
                else:
                    card["nota"].append(l)
                continue
            corpo.append(l)
        card["sql"] = "\n".join(corpo).strip().rstrip(";").strip()
        if not card["sql"]:
            continue
        faltando = [k for k in ("titulo", "secao", "viz", "size") if k not in card]
        if faltando:
            sys.exit(f"!! card `{card['id']}` sem {', '.join(faltando)} no front-matter")
        cards.append(card)
    return cards


def main() -> None:
    views = carregar_views()
    cards = parse_cards((BASE / "cards.sql").read_text())
    SAIDA.mkdir(exist_ok=True)
    for antigo in SAIDA.glob("*.sql"):
        antigo.unlink()

    for n, card in enumerate(cards, 1):
        sql = card["sql"]
        # Expande /*@filtros*/ e /*@filtros <alias>*/.
        # O bloco SEMPRE começa em linha nova: quando o placeholder está no
        # meio de uma linha (`WHERE x = y /*@filtros i*/)`), colar sem quebra
        # gruda a cláusula no token anterior e vira `yAND x = ...`.
        def expande(mo):
            bloco = bloco_de_filtros(card.get("filtros", "padrao"), mo.group(1) or "")
            return ("\n" + bloco) if bloco else ""
        sql = re.sub(r"[ \t]*/\*@filtros(?:\s+(\w+))?\*/", expande, sql)
        if "@filtros" in sql:
            sys.exit(f"!! `{card['id']}`: sobrou um /*@filtros*/ mal escrito")

        pre = preambulo(sql, views)
        if pre and re.match(r"WITH\s", sql, re.I):
            corpo = pre + ",\n" + re.sub(r"^WITH\s+", "", sql, flags=re.I)
        elif pre:
            corpo = pre + "\n" + sql
        else:
            corpo = sql

        cabecalho = (
            f"-- {card['titulo']}\n"
            f"-- {card.get('pergunta', '')}\n"
            f"--\n"
            f"-- GERADO POR build.py — NÃO EDITE. Edite cards.sql.\n"
            f"-- Cole este arquivo inteiro no editor nativo do Metabase.\n"
            + "".join(l + "\n" for l in card["nota"] if l.strip() not in ("--", ""))
        )
        destino = SAIDA / f"{n:02d}-{card['id']}.sql"
        destino.write_text(cabecalho + "\n" + corpo + ";\n")

    # O manifesto: o provision.ts lê daqui em vez de reinterpretar o SQL.
    # Build produz o artefato completo — SQL pronto e metadado ao lado.
    manifesto = [
        {
            "id": c["id"],
            "arquivo": f"{n:02d}-{c['id']}.sql",
            "titulo": c["titulo"],
            "secao": c["secao"],
            "viz": c["viz"],
            "size": [int(x) for x in c["size"].lower().split("x")],
            "pergunta": c.get("pergunta", ""),
            "pivot": c.get("pivot", ""),
            "variaveis": sorted(set(re.findall(
                r"\{\{(\w+)\}\}", (SAIDA / f"{n:02d}-{c['id']}.sql").read_text()))),
        }
        for n, c in enumerate(cards, 1)
    ]
    (SAIDA / "manifesto.json").write_text(
        json.dumps(manifesto, ensure_ascii=False, indent=2) + "\n")

    total = sum(f.stat().st_size for f in SAIDA.glob("*.sql")) / 1024
    print(f"{len(cards)} cards -> standalone/  ({total:.0f} KB)  + manifesto.json")
    secao = None
    for c in manifesto:
        if c["secao"] != secao:
            secao = c["secao"]
            print(f"  ── {secao}")
        print(f"     {c['arquivo']:<26} {c['viz']:<6} "
              f"{c['size'][0]}x{c['size'][1]:<4} {len(c['variaveis'])} filtros")


if __name__ == "__main__":
    main()
