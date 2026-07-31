import base64
import asyncio
import hashlib
import unicodedata

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AIConfiguration, AIProviderCredential


GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta"
OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"


def _cipher() -> Fernet:
    digest = hashlib.sha256(get_settings().secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_api_key(value: str) -> str:
    return _cipher().encrypt(value.strip().encode("utf-8")).decode("ascii")


def decrypt_api_key(value: str) -> str:
    if not value:
        return ""
    try:
        return _cipher().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return ""


def mask_api_key(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 10:
        return "••••••••"
    return f"{value[:4]}••••••••{value[-4:]}"


def get_ai_configuration(db: Session) -> AIConfiguration | None:
    return db.query(AIConfiguration).order_by(AIConfiguration.id).first()


def get_provider_credential(db: Session, provider: str) -> AIProviderCredential | None:
    return db.query(AIProviderCredential).filter(AIProviderCredential.provider == provider).first()


def public_configuration(
    config: AIConfiguration | None,
    credential: AIProviderCredential | None = None,
) -> dict:
    provider = config.provider if config else "template"
    if provider == "openai":
        key = decrypt_api_key(credential.api_key_encrypted) if credential else ""
        model = credential.model if credential else "gpt-5.6-sol"
        organization_id = credential.organization_id if credential else ""
        project_id = credential.project_id if credential else ""
        updated_at = credential.updated_at if credential else None
    else:
        key = decrypt_api_key(config.api_key_encrypted) if config else ""
        model = config.model if config else "gemini-3.6-flash"
        organization_id = ""
        project_id = ""
        updated_at = config.updated_at if config else None
    return {
        "provider": provider,
        "enabled": bool(config.enabled) if config else False,
        "model": model,
        "configured": bool(key),
        "masked_api_key": mask_api_key(key),
        "organization_id": organization_id,
        "project_id": project_id,
        "updated_at": updated_at,
    }


async def openai_generate(
    api_key: str,
    model: str,
    prompt: str,
    system_instruction: str,
    max_output_tokens: int = 32768,
    inline_files: list[tuple[str, bytes]] | None = None,
    organization_id: str = "",
    project_id: str = "",
) -> str:
    content: list[dict] = [{"type": "input_text", "text": prompt}]
    for mime_type, data in inline_files or []:
        encoded = base64.b64encode(data).decode("ascii")
        content.append({
            "type": "input_image",
            "image_url": f"data:{mime_type};base64,{encoded}",
            "detail": "auto",
        })
    payload = {
        "model": model,
        "instructions": system_instruction,
        "input": [{"role": "user", "content": content}],
        "reasoning": {"effort": "medium"},
        "max_output_tokens": max_output_tokens,
        "store": False,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    if organization_id.strip():
        headers["OpenAI-Organization"] = organization_id.strip()
    if project_id.strip():
        headers["OpenAI-Project"] = project_id.strip()
    async with httpx.AsyncClient(timeout=300) as client:
        response = None
        for attempt in range(3):
            response = await client.post(OPENAI_RESPONSES_URL, headers=headers, json=payload)
            if response.status_code not in {429, 500, 502, 503, 504} or attempt == 2:
                break
            await asyncio.sleep(1.25 * (attempt + 1))
    assert response is not None
    if response.status_code == 400:
        detail = response.json().get("error", {}).get("message", "")
        raise ValueError(detail or "A OpenAI não aceitou a configuração enviada.")
    if response.status_code == 401:
        raise ValueError("Chave da OpenAI inválida.")
    if response.status_code == 403:
        raise ValueError("A chave não possui permissão para este projeto ou modelo.")
    if response.status_code == 429:
        raise ValueError("O limite de uso ou os créditos da OpenAI foram atingidos.")
    if response.status_code >= 500:
        raise ValueError("A OpenAI está temporariamente indisponível.")
    response.raise_for_status()
    data = response.json()
    text_parts: list[str] = []
    for item in data.get("output", []):
        if item.get("type") != "message":
            continue
        for part in item.get("content", []):
            if part.get("type") == "output_text":
                text_parts.append(part.get("text", ""))
    text = "".join(text_parts).strip()
    if not text:
        raise ValueError("A conexão foi aceita, mas a OpenAI não devolveu texto.")
    return unicodedata.normalize("NFC", text).replace("\x00", "").strip()


async def gemini_generate(
    api_key: str,
    model: str,
    prompt: str,
    system_instruction: str,
    max_output_tokens: int = 32768,
    inline_files: list[tuple[str, bytes]] | None = None,
) -> str:
    url = f"{GEMINI_API_ROOT}/models/{model}:generateContent"
    user_parts: list[dict] = [{"text": prompt}]
    for mime_type, data in inline_files or []:
        user_parts.append({
            "inlineData": {
                "mimeType": mime_type,
                "data": base64.b64encode(data).decode("ascii"),
            }
        })
    payload = {
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "contents": [{"role": "user", "parts": user_parts}],
        "generationConfig": {
            "maxOutputTokens": max_output_tokens,
            "responseMimeType": "text/plain",
            # Mantém precisão institucional sem produzir respostas idênticas
            # para solicitações diferentes.
            "temperature": 0.55,
            "topP": 0.9,
        },
    }
    async with httpx.AsyncClient(timeout=300) as client:
        response = None
        for attempt in range(3):
            response = await client.post(url, params={"key": api_key}, json=payload)
            if response.status_code not in {429, 500, 502, 503, 504} or attempt == 2:
                break
            await asyncio.sleep(1.25 * (attempt + 1))
    assert response is not None
    if response.status_code == 400:
        raise ValueError("A chave ou a configuração do Gemini não foi aceita.")
    if response.status_code in {401, 403}:
        raise ValueError("Chave do Gemini inválida ou sem permissão para este modelo.")
    if response.status_code == 429:
        raise ValueError("O limite de uso do projeto Gemini foi atingido. Tente novamente mais tarde.")
    if response.status_code >= 500:
        raise ValueError("O Gemini está temporariamente indisponível.")
    response.raise_for_status()
    data = response.json()
    candidates = data.get("candidates") or []
    if not candidates:
        reason = data.get("promptFeedback", {}).get("blockReason")
        raise ValueError(f"O Gemini não produziu uma resposta{f': {reason}' if reason else ''}.")
    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(part.get("text", "") for part in parts).strip()
    if not text:
        finish_reason = candidates[0].get("finishReason", "")
        if finish_reason == "MAX_TOKENS":
            raise ValueError("O Gemini atingiu o limite de saída antes de concluir. Aumente o limite de tokens.")
        raise ValueError("A conexão foi aceita, mas o Gemini não devolveu texto. Tente novamente.")
    return unicodedata.normalize("NFC", text).replace("\x00", "").strip()


async def configured_generation(
    db: Session,
    prompt: str,
    system_instruction: str,
    max_output_tokens: int = 32768,
    inline_files: list[tuple[str, bytes]] | None = None,
) -> str | None:
    config = get_ai_configuration(db)
    if not config or not config.enabled:
        return None
    if config.provider == "gemini":
        api_key = decrypt_api_key(config.api_key_encrypted)
        if not api_key:
            return None
        return await gemini_generate(
            api_key=api_key,
            model=config.model,
            prompt=prompt,
            system_instruction=system_instruction,
            max_output_tokens=max_output_tokens,
            inline_files=inline_files,
        )
    if config.provider == "openai":
        credential = get_provider_credential(db, "openai")
        api_key = decrypt_api_key(credential.api_key_encrypted) if credential else ""
        if not credential or not api_key:
            return None
        return await openai_generate(
            api_key=api_key,
            model=credential.model,
            prompt=prompt,
            system_instruction=system_instruction,
            max_output_tokens=max_output_tokens,
            inline_files=inline_files,
            organization_id=credential.organization_id,
            project_id=credential.project_id,
        )
    return None
