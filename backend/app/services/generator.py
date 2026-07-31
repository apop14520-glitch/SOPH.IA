from typing import Any
import re
import unicodedata
import httpx
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.services.ai_provider import configured_generation


HEADING_ACRONYMS = ("SOPH.IA", "SOPH", "ETP", "TR", "RILC", "SEI", "TI", "RH", "PDF", "DOCX", "IA")


def _sentence_case(value: str) -> str:
    lowered = value.strip().casefold()
    if not lowered:
        return lowered
    lowered = lowered[:1].upper() + lowered[1:]
    for acronym in HEADING_ACRONYMS:
        pattern = r"(?<![\w.])" + re.escape(acronym.casefold()) + r"(?!\w)"
        lowered = re.sub(pattern, acronym, lowered, flags=re.IGNORECASE)
    return lowered


def normalize_headings(text: str) -> str:
    normalized_lines = []
    for line in text.splitlines():
        markdown = re.match(r"^(\s*#{1,6}\s+)(.+?)\s*$", line)
        bold = re.match(r"^(\s*\*\*)([^*]+)(\*\*\s*)$", line)
        plain_upper = (
            line.strip()
            and len(line.strip()) <= 80
            and any(character.isalpha() for character in line)
            and line.strip() == line.strip().upper()
        )
        if markdown:
            line = markdown.group(1) + _sentence_case(markdown.group(2))
        elif bold:
            line = bold.group(1) + _sentence_case(bold.group(2)) + bold.group(3)
        elif plain_upper:
            prefix = line[: len(line) - len(line.lstrip())]
            line = prefix + _sentence_case(line.strip())
        normalized_lines.append(line)
    return "\n".join(normalized_lines)


def conversation_title(prompt: str) -> str:
    text = unicodedata.normalize("NFC", re.sub(r"\s+", " ", prompt)).strip(" .,:;!?-")
    text = re.sub(
        r"^(por favor[,\s]+)?(crie|elabore|faça|gere|redija|prepare|analise|revise|explique|"
        r"preciso de|gostaria de|quero)\s+(um|uma|o|a)?\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )
    replacements = (
        (r"\bestudo técnico preliminar\b", "ETP"),
        (r"\btermo de referência\b", "Termo de Referência"),
        (r"\brilc\b", "RILC"),
        (r"\bsoph\.?ia\b", "SOPH.IA"),
        (r"\bsoph\b", "SOPH"),
        (r"\bsei\b", "SEI"),
    )
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    words = text.split()
    if len(words) > 9:
        words = words[:9]
    text = " ".join(words).strip(" .,:;!?-")
    if len(text) > 64:
        text = text[:64].rsplit(" ", 1)[0]
    if not text:
        return "Nova conversa"
    acronyms = {"ETP", "TR", "RILC", "SOPH", "SOPH.IA", "SEI", "TI", "RH", "PDF", "DOCX", "IA"}
    result = []
    for index, word in enumerate(text.split()):
        normalized = word.upper()
        if normalized in acronyms:
            result.append(normalized)
        elif index == 0:
            result.append(word.casefold()[:1].upper() + word.casefold()[1:])
        else:
            result.append(word.casefold())
    return " ".join(result)


def val(fields: dict[str, Any], key: str, fallback: str = "[INFORMAÇÃO A COMPLETAR]") -> str:
    value = fields.get(key)
    return str(value).strip() if value not in (None, "") else fallback


def template_generate(kind: str, fields: dict[str, Any], sources: list[dict]) -> str:
    source_note = "; ".join(s["title"] for s in sources) or "Base institucional sem fonte correspondente"
    if kind == "despacho":
        return f"""DESPACHO

Interessado: {val(fields, "interessado")}
Assunto: {val(fields, "assunto")}

Considerando {val(fields, "contexto")},

{val(fields, "decisao")}

Encaminhem-se os autos à {val(fields, "destino")} para conhecimento e providências cabíveis.

{val(fields, "local_data")}

{val(fields, "assinante")}
{val(fields, "cargo")}

Referências consultadas: {source_note}."""
    if kind == "memorando":
        return f"""MEMORANDO

À: {val(fields, "destinatario")}
De: {val(fields, "remetente")}
Assunto: {val(fields, "assunto")}

Senhor(a) {val(fields, "tratamento", "Responsável")},

{val(fields, "mensagem")}

Solicita-se {val(fields, "providencia")}, no prazo de {val(fields, "prazo")}.

Atenciosamente,

{val(fields, "assinante")}
{val(fields, "cargo")}

Referências consultadas: {source_note}."""
    if kind == "etp":
        return f"""ESTUDO TÉCNICO PRELIMINAR

1. IDENTIFICAÇÃO DA DEMANDA
Unidade demandante: {val(fields, "unidade")}
Objeto: {val(fields, "objeto")}

2. PROBLEMA E NECESSIDADE
{val(fields, "problema")}

3. REQUISITOS DA CONTRATAÇÃO
{val(fields, "requisitos")}

4. LEVANTAMENTO DE MERCADO E ALTERNATIVAS
{val(fields, "alternativas")}

5. DESCRIÇÃO DA SOLUÇÃO
{val(fields, "solucao")}

6. ESTIMATIVA DAS QUANTIDADES
Quantidade: {val(fields, "quantidade")}
Memória de cálculo: {val(fields, "memoria_calculo")}

7. ESTIMATIVA DO VALOR
{val(fields, "estimativa_valor")}

8. RESULTADOS PRETENDIDOS
{val(fields, "resultados")}

9. RISCOS E MEDIDAS DE TRATAMENTO
{val(fields, "riscos")}

10. IMPACTOS AMBIENTAIS E SUSTENTABILIDADE
{val(fields, "sustentabilidade")}

11. CONCLUSÃO
Com base nas informações apresentadas, a equipe {val(fields, "conclusao", "deverá avaliar a viabilidade da contratação após o preenchimento integral deste estudo")}.

Referências consultadas: {source_note}."""
    return f"""TERMO DE REFERÊNCIA

1. OBJETO
{val(fields, "objeto")}

2. FUNDAMENTAÇÃO E JUSTIFICATIVA
{val(fields, "justificativa")}

3. ESPECIFICAÇÕES E QUANTITATIVOS
{val(fields, "especificacoes")}
Quantidade: {val(fields, "quantidade")}

4. PRAZO, LOCAL E CONDIÇÕES DE EXECUÇÃO
{val(fields, "execucao")}

5. OBRIGAÇÕES DA CONTRATADA
{val(fields, "obrigacoes_contratada")}

6. OBRIGAÇÕES DA CONTRATANTE
{val(fields, "obrigacoes_contratante")}

7. GESTÃO E FISCALIZAÇÃO
{val(fields, "fiscalizacao")}

8. CRITÉRIOS DE MEDIÇÃO E PAGAMENTO
{val(fields, "pagamento")}

9. SELEÇÃO DO FORNECEDOR
{val(fields, "selecao")}

10. ESTIMATIVA DO VALOR
{val(fields, "estimativa_valor")}

11. SANÇÕES E RISCOS
{val(fields, "sancoes_riscos")}

Referências consultadas: {source_note}."""


DOCUMENT_SYSTEM_INSTRUCTION = (
    "Você é a SOPH.IA, assistente especializada na elaboração de documentos oficiais da Sociedade de Portos "
    "e Hidrovias de Rondônia. Escreva em português brasileiro formal, UTF-8 e Unicode NFC. Observe clareza, "
    "precisão, concisão, coesão, impessoalidade, uniformidade, correção gramatical e as convenções pertinentes "
    "da ABNT e da redação oficial. Preserve a estrutura e a finalidade do documento. Não invente fatos, valores, "
    "números de processo, autoridades, datas, dispositivos legais ou fontes. Quando um dado não estiver disponível, "
    "omita naturalmente o campo em vez de escrever marcadores, colchetes ou '[INFORMAÇÃO A COMPLETAR]'. Entregue a minuta completa, sem "
    "listas genéricas de perguntas, comentários sobre o processo de geração ou saudações. Toda minuta deve ser "
    "submetida à revisão humana e jurídica competente. Escreva títulos e subtítulos em formato de frase: apenas a "
    "primeira palavra começa com maiúscula. Preserve caixa alta somente em siglas oficiais, como SOPH, ETP, TR, "
    "RILC, SEI, TI e RH. Nunca escreva nomes de documentos ou títulos inteiros em caixa alta."
)


CHAT_SYSTEM_INSTRUCTION = (
    "Você é a SOPH.IA, assistente institucional especializada em redação administrativa da Sociedade de Portos "
    "e Hidrovias de Rondônia. Antes de responder, identifique silenciosamente: o objetivo concreto do usuário, "
    "o gênero documental solicitado, os fatos e nomes fornecidos, o destinatário implícito, a providência esperada "
    "e as referências aplicáveis. A resposta deve ser específica para a solicitação atual. Nunca reutilize uma "
    "resposta anterior como molde textual sem adaptar integralmente objeto, contexto, argumentos e encaminhamento. "
    "Não mencione essa análise interna. Responda em "
    "português brasileiro formal, com correção ortográfica, gramatical e terminológica. Apresente respostas "
    "visualmente limpas e prontas para uso, no padrão de um assistente profissional. Use Markdown legível, "
    "parágrafos curtos e listas apenas quando melhorarem a leitura. Não exagere no tamanho ou na quantidade de títulos. "
    "Observe as convenções pertinentes da ABNT e da redação oficial: clareza, precisão, concisão, coesão, "
    "impessoalidade e uniformidade. Padronize artigos como 'art. 17', leis como 'Lei nº 13.303/2016', datas e "
    "siglas. Nunca invente leis, números, processos, valores ou autoridades. Use somente informações fornecidas "
    "pelo usuário, pelos arquivos e pelas referências institucionais apresentadas. Aproveite concretamente nomes, "
    "objetos, quantidades, justificativas, decisões e unidades mencionadas no pedido; não os substitua por expressões "
    "vazias como 'solicitação apresentada', 'unidade competente', 'providências pertinentes' ou 'normativos "
    "aplicáveis' quando o pedido trouxer informação mais precisa. Responda diretamente ao pedido e produza a "
    "melhor versão possível sem exigir novas informações. Quando algum dado não estiver disponível, omita-o "
    "naturalmente; nunca escreva '[INFORMAÇÃO A COMPLETAR]', campos entre colchetes ou linhas para preenchimento. "
    "Ao elaborar ETP, TR, Despacho ou Memorando, entregue uma minuta completa. Ao "
    "analisar arquivos, sintetize e aplique o conteúdo sem reproduzir páginas, sumários, cabeçalhos, rodapés, "
    "URLs de impressão ou texto corrompido. Quando o usuário solicitar uma minuta, comece com uma única frase "
    "breve informando o que será entregue; insira uma linha horizontal; apresente o nome do documento em "
    "negrito e em formato de frase, nunca inteiramente em caixa alta; entregue imediatamente o texto integral, com linguagem administrativa natural, objetiva "
    "e bem desenvolvida; use listas somente para enumerações reais; encerre com o encaminhamento, fecho ou assinatura "
    "adequados. Não inclua seções artificiais chamadas 'Observação', 'Validação necessária', 'Critério de resposta' "
    "ou comentários sobre como a IA produziu o texto, salvo se o usuário pedir. Informe de modo discreto quando uma "
    "afirmação depender de validação humana, técnica ou jurídica. Para Despachos, Memorandos, Ofícios e comunicações "
    "destinadas ao SEI, gere por padrão somente o conteúdo textual pronto para copiar e colar no editor do SEI. "
    "Não apresente campos de remetente, destinatário, número do processo, local, data, nome, assinatura, cargo ou "
    "função, a menos que o usuário forneça esses dados e solicite expressamente sua inclusão. Evite numerar parágrafos "
    "em textos curtos. Em todos os títulos e subtítulos, use maiúscula somente na primeira palavra e em siglas "
    "oficiais, como SOPH, ETP, TR, RILC, SEI, TI e RH. Não use caixa alta para criar ênfase. "
    "Não acrescente códigos, formulários, tabelas ou metadados que não tenham sido pedidos. "
    "Para perguntas comuns, responda de forma conversacional e direta. Para análise, apresente conclusões fundamentadas "
    "nos trechos relevantes, e não uma lista fixa de capacidades da SOPH.IA. Para elaboração documental, desenvolva "
    "argumentos conectados ao caso concreto, varie a construção dos parágrafos e elimine frases genéricas que poderiam "
    "servir igualmente para qualquer assunto. Se o pedido permitir mais de uma interpretação, adote a mais provável "
    "e sinalize a premissa em uma frase curta, sem transformar a resposta em questionário."
)


async def generate(kind: str, fields: dict, sources: list[dict], db: Session | None = None) -> str:
    settings = get_settings()
    draft = template_generate(kind, fields, sources)
    if db is not None:
        try:
            result = await configured_generation(
                db,
                prompt=f"Aprimore e complete a minuta abaixo. Retorne somente o documento final.\n\nMINUTA:\n{draft}",
                system_instruction=DOCUMENT_SYSTEM_INSTRUCTION,
            )
        except (ValueError, httpx.HTTPError):
            result = None
        if result:
            return normalize_headings(result)
    if settings.ai_provider.lower() != "ollama":
        return draft
    prompt = (
        "Você é a SOPH.IA. Aprimore a minuta administrativa abaixo sem inventar fatos, "
        "números ou fundamentos. Preserve campos [INFORMAÇÃO A COMPLETAR]. Retorne apenas "
        f"o documento final.\n\nMINUTA:\n{draft}"
    )
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.post(
            f"{settings.ollama_base_url}/api/generate",
            json={"model": settings.ollama_model, "prompt": prompt, "stream": False},
        )
        response.raise_for_status()
        return response.json()["response"].strip()


async def chat_reply(
    prompt: str,
    context: str,
    history: list[dict],
    db: Session | None = None,
    inline_files: list[tuple[str, bytes]] | None = None,
) -> str:
    settings = get_settings()
    history_text = "\n".join(f"{m['role']}: {m['content']}" for m in history[-20:])
    ai_error: str | None = None
    if db is not None:
        try:
            result = await configured_generation(
                db,
                prompt=(
                    "TAREFA: produza uma resposta nova e integralmente adaptada ao caso concreto. Extraia e use todos "
                    "os fatos úteis da solicitação e dos anexos. Não preencha espaço com frases institucionais "
                    "genéricas. Se for uma minuta, entregue o texto efetivamente utilizável, não instruções sobre "
                    "como redigi-lo.\n\n"
                    f"REFERÊNCIAS E ANEXOS AUTORIZADOS:\n{context or 'Nenhuma referência relacionada foi localizada.'}\n\n"
                    f"HISTÓRICO RECENTE:\n{history_text or 'Sem mensagens anteriores.'}\n\n"
                    f"SOLICITAÇÃO DO USUÁRIO:\n{prompt}"
                ),
                system_instruction=CHAT_SYSTEM_INSTRUCTION,
                inline_files=inline_files,
            )
        except (ValueError, httpx.HTTPError) as exc:
            ai_error = str(exc)
            result = None
        if result:
            return normalize_headings(result)
        if ai_error:
            return (
                "Não foi possível gerar uma resposta específica neste momento porque o provedor de inteligência "
                f"artificial informou: {ai_error} Tente novamente em instantes ou verifique a conexão em Configurações."
            )
    if settings.ai_provider.lower() == "ollama":
        instruction = (
            "Você é a SOPH.IA, assistente institucional da Sociedade de Portos e Hidrovias de Rondônia. "
            "Responda em português brasileiro formal, com correção ortográfica, gramatical e terminológica. "
            "Use estrutura hierárquica em Markdown: títulos com ##, subtítulos com ###, parágrafos curtos e "
            "listas apenas quando apropriado. Observe as convenções aplicáveis da ABNT, o Manual de Redação "
            "da Presidência da República e a redação oficial: clareza, precisão, concisão, coesão, impessoalidade "
            "e uniformidade. Padronize artigos como 'art. 17', leis como 'Lei nº 13.303/2016', datas e siglas. "
            "Nunca reproduza sumários, cabeçalhos, rodapés, URLs de impressão ou sequências de traços como texto. "
            "Use somente os fatos presentes no pedido ou no contexto institucional. Não invente leis, números, "
            "processos ou autoridades. Responda diretamente ao que foi solicitado. Não devolva listas genéricas "
            "perguntando quais dados o usuário deve informar: elabore a melhor resposta possível e marque somente "
            "dados realmente ausentes com [INFORMAÇÃO A COMPLETAR]. Quando analisar um documento, não reproduza o "
            "texto bruto; apresente confirmação da leitura, síntese, principais pontos, aplicação prática para a "
            "SOPH e próximos passos, seguindo o padrão conversacional do ChatGPT. Use UTF-8, Unicode NFC e português "
            "brasileiro. Toda minuta exige revisão humana.\n\n"
            f"CONTEXTO LOCAL:\n{context or 'Nenhum documento local relacionado.'}\n\n"
            f"HISTÓRICO:\n{history_text}\n\nUSUÁRIO: {prompt}"
        )
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                f"{settings.ollama_base_url}/api/generate",
                json={"model": settings.ollama_model, "prompt": instruction, "stream": False},
            )
            response.raise_for_status()
            return unicodedata.normalize("NFC", response.json()["response"]).replace("\x00", "").strip()
    lower = prompt.lower()
    if any(word in lower for word in ("etp", "estudo técnico preliminar")):
        return (
            "## Estudo Técnico Preliminar\n\n### 1. Objeto\n\n"
            f"{prompt.strip()}\n\n### 2. Necessidade da contratação\n\n[INFORMAÇÃO A COMPLETAR]\n\n"
            "### 3. Requisitos e alternativas\n\nA solução deverá atender às necessidades operacionais da SOPH, "
            "observados os modelos e normativos institucionais aplicáveis.\n\n### 4. Quantitativos e valor\n\n"
            "[MEMÓRIA DE CÁLCULO E PESQUISA DE PREÇOS A COMPLETAR]\n\n### 5. Conclusão\n\nA viabilidade deverá ser "
            "confirmada pela unidade competente após a complementação dos dados técnicos e econômicos."
        )
    if "termo de referência" in lower or re.search(r"\btr\b", lower):
        return (
            "## Termo de Referência\n\n### 1. Objeto\n\n"
            f"{prompt.strip()}\n\n### 2. Justificativa\n\n[INFORMAÇÃO A COMPLETAR]\n\n### 3. Especificações e "
            "quantitativos\n\n[INFORMAÇÃO A COMPLETAR]\n\n### 4. Execução, fiscalização e pagamento\n\nA execução "
            "será acompanhada por agente formalmente designado e o pagamento dependerá do recebimento do objeto."
        )
    if "despacho" in lower:
        return (
            "Segue o texto de despacho, em formato objetivo e pronto para inserção no SEI.\n\n---\n\n"
            "**DESPACHO**\n\nEm atenção à solicitação apresentada, encaminhem-se os autos à unidade competente "
            "para análise e adoção das providências cabíveis.\n\nApós a devida instrução, retornem os autos para "
            "continuidade do procedimento administrativo."
        )
    if "memorando" in lower:
        return (
            "Segue o texto de memorando, em formato objetivo e pronto para inserção no SEI.\n\n---\n\n"
            "**MEMORANDO**\n\nEncaminha-se a presente comunicação para análise e adoção das providências "
            "pertinentes, observados os procedimentos e normativos institucionais aplicáveis.\n\n"
            "Permanecemos à disposição para os esclarecimentos necessários."
        )
    if any(word in lower for word in ("revise", "revisar", "corrija", "melhore")) and context:
        revised, observations = review_text(context)
        return f"Segue a revisão solicitada:\n\n{revised}\n\nObservações:\n- " + "\n- ".join(observations)
    if context:
        lines = [line.strip() for line in context.splitlines() if len(line.strip()) > 5]
        topics = list(dict.fromkeys(lines))[:10]
        bullets = "\n".join(f"- {line[:220]}" for line in topics)
        return (
            "Perfeito. Analisei o documento e passarei a considerá-lo como referência institucional nesta conversa.\n\n"
            "## Principais pontos identificados\n\n"
            f"{bullets}\n\n"
            "## Aplicação prática para a SOPH\n\n"
            "- elaboração e revisão de ETPs e Termos de Referência;\n"
            "- preparação de Despachos e Memorandos;\n"
            "- conferência de requisitos e fundamentos; e\n"
            "- indicação das fontes utilizadas.\n\n"
            "Nas próximas respostas, apresentarei síntese, explicação e aplicação prática, sem reproduzir páginas, "
            "sumários, cabeçalhos ou trechos quebrados do arquivo."
        )
    return (
        "Estou pronta para apoiar a SOPH na elaboração e revisão documental. Posso criar Despachos, "
        "Memorandos, ETPs e Termos de Referência, analisar PDF/DOCX e consultar a biblioteca institucional. "
        "Descreva o que precisa ou anexe um documento."
    )


def review_text(text: str) -> tuple[str, list[str]]:
    revised = re.sub(r"[ \t]+", " ", text)
    revised = re.sub(r"\n{3,}", "\n\n", revised)
    revised = re.sub(r"\bart\.?\s*(\d+)", r"art. \1", revised, flags=re.IGNORECASE)
    revised = re.sub(r"\bLei\s+(?:n[º°o]\s*)?(\d)", r"Lei nº \1", revised, flags=re.IGNORECASE)
    revised = re.sub(r"(?<=[a-záéíóúç])(?=[A-ZÁÉÍÓÚÇ])", " ", revised)
    observations = []
    if "[INFORMAÇÃO A COMPLETAR]" in text:
        observations.append("Existem campos obrigatórios ainda não preenchidos.")
    if len(text) < 200:
        observations.append("O texto está curto; verifique se contém contexto, decisão e encaminhamento.")
    if not observations:
        observations.append("Revisão básica concluída. Recomenda-se validação humana e jurídica.")
    return revised.strip(), observations
