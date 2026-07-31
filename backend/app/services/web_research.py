import hashlib
import ipaddress
import logging
import re
import socket
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings

logger = logging.getLogger("sophia.web_research")

DOCUMENT_TERMS = {
    "etp", "estudo técnico preliminar", "termo de referência", "tr", "despacho",
    "memorando", "ofício", "portaria", "minuta", "edital", "contratação",
    "licitação", "relatório técnico", "parecer", "matriz de riscos",
}
SPECIFIC_TEMPLATE_TERMS = {
    "exatamente igual", "idêntico ao modelo", "conforme o modelo da",
    "formulário específico", "layout específico", "padrão exclusivo",
    "modelo próprio", "modelo interno", "mesmo formato do",
}
STOP_WORDS = {
    "para", "como", "com", "uma", "esse", "essa", "isso", "faça", "crie",
    "elabore", "documento", "modelo", "sophia", "soph",
}


def is_document_request(prompt: str) -> bool:
    value = prompt.casefold()
    return any(
        re.search(rf"\b{re.escape(term)}\b", value) if len(term) <= 3 else term in value
        for term in DOCUMENT_TERMS
    )


def requires_specific_model(prompt: str) -> bool:
    value = prompt.casefold()
    return any(term in value for term in SPECIFIC_TEMPLATE_TERMS)


def requested_document_type(prompt: str) -> str:
    value = prompt.casefold()
    if "estudo técnico preliminar" in value or re.search(r"\betp\b", value):
        return "Estudo Técnico Preliminar"
    if "termo de referência" in value or re.search(r"\btr\b", value):
        return "Termo de Referência"
    for name in ("Despacho", "Memorando", "Ofício", "Portaria", "Edital", "Relatório Técnico", "Parecer"):
        if name.casefold() in value:
            return name
    return "documento administrativo"


def relevant_terms(prompt: str) -> set[str]:
    return {
        term for term in re.findall(r"[a-záéíóúâêôãõç0-9]+", prompt.casefold())
        if (len(term) > 3 or term in {"etp", "tr"}) and term not in STOP_WORDS
    }


def _allowed_host(url: str) -> bool:
    settings = get_settings()
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").casefold().rstrip(".")
        if parsed.scheme != "https" or not host:
            return False
        allowed = [item.casefold().strip().lstrip(".") for item in settings.web_allowed_domains.split(",") if item.strip()]
        if not any(host == domain or host.endswith(f".{domain}") for domain in allowed):
            return False
        for address in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM):
            ip = ipaddress.ip_address(address[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return True
    except Exception:
        return False


def _pertinent(result: dict, prompt: str) -> bool:
    haystack = f"{result.get('title', '')} {result.get('content', '')}".casefold()
    terms = relevant_terms(prompt)
    document_markers = ("termo de referência", "estudo técnico", "minuta", "contratação", "licitação", "modelo", "manual")
    return bool(terms.intersection(re.findall(r"[a-záéíóúâêôãõç0-9]+", haystack))) and any(marker in haystack for marker in document_markers)


async def research_official_documents(prompt: str) -> list[dict]:
    settings = get_settings()
    if not settings.web_search_enabled or not settings.ollama_api_key or not is_document_request(prompt):
        return []
    document_type = requested_document_type(prompt)
    query = (
        f'modelo oficial "{document_type}" {prompt[:180]} '
        "site:gov.br OR site:planalto.gov.br OR site:tcu.gov.br OR site:cgu.gov.br"
    )
    headers = {"Authorization": f"Bearer {settings.ollama_api_key}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=settings.web_search_timeout_seconds, follow_redirects=False) as client:
            response = await client.post(
                "https://ollama.com/api/web_search",
                headers=headers,
                json={"query": query, "max_results": min(settings.web_search_max_results, 10)},
            )
            response.raise_for_status()
        accepted = []
        for result in response.json().get("results", []):
            url = result.get("url", "")
            if not _allowed_host(url) or not _pertinent(result, prompt):
                continue
            content = re.sub(r"\s+", " ", result.get("content", "")).strip()[:1800]
            accepted.append({
                "id": f"web:{hashlib.sha256(url.encode()).hexdigest()[:16]}",
                "title": result.get("title", "Fonte oficial"),
                "url": url,
                "excerpt": content,
                "source_type": "web",
            })
        logger.info("Pesquisa documental: query=%r resultados_aceitos=%s", query, len(accepted))
        return accepted[: settings.web_search_max_results]
    except Exception as exc:
        logger.warning("Pesquisa documental indisponível: %s", exc)
        return []
