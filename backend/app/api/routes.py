import json
import re
import uuid
import httpx
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from app.api.deps import admin, current_user, user_manager
from app.core.config import get_settings
from app.core.security import create_token, hash_password, verify_password
from app.database import get_db
from app.models import AIConfiguration, AIProviderCredential, ChatMessage, Conversation, DocumentVersion, GeneratedDocument, KnowledgeDocument, LearningExample, Sector, User
from app.schemas import (
    AIConfigurationIn, AIConfigurationOut, AIConnectionTestIn, GeneratedOut, GenerateIn,
    KnowledgeOut, LearningStatusIn, LoginIn, PasswordChangeIn, PublicRegisterIn, ReviewIn, ReviewOut, SectorIn,
    ChatIn, ConversationIn, SectorOut, StatusIn, TokenOut, UserIn, UserOut, UserUpdateIn, VersionIn,
)
from app.services.ai_provider import (
    decrypt_api_key, encrypt_api_key, gemini_generate, get_ai_configuration, get_provider_credential,
    openai_generate, public_configuration,
)
from app.services.exporter import make_docx
from app.services.extraction import extract_text
from app.services.generator import chat_reply, conversation_title, generate, review_text
from app.services.knowledge import search_sources
from app.services.learning import learning_context
from app.services.web_research import (
    is_document_request, requested_document_type, requires_specific_model,
    research_official_documents,
)

router = APIRouter()
IMAGE_MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def serialize_document(doc: GeneratedDocument) -> dict:
    return {
        "id": doc.id, "title": doc.title, "document_type": doc.document_type,
        "status": doc.status, "form_data": json.loads(doc.form_data), "created_by": doc.created_by,
        "sector_id": doc.sector_id, "created_at": doc.created_at, "updated_at": doc.updated_at,
        "versions": [{
            "id": v.id, "number": v.number, "content": v.content,
            "sources": json.loads(v.sources), "change_note": v.change_note, "created_at": v.created_at
        } for v in doc.versions],
    }


def serialize_conversation(item: Conversation, include_messages: bool = True) -> dict:
    result = {"id": item.id, "title": item.title, "created_at": item.created_at, "updated_at": item.updated_at}
    if include_messages:
        result["messages"] = [{"id": m.id, "role": m.role, "content": m.content,
            "sources": json.loads(m.sources), "attachment_ids": json.loads(m.attachment_ids),
            "created_at": m.created_at} for m in item.messages]
    return result


@router.get("/health")
def health():
    return {"status": "ok", "service": "SOPH.IA"}


@router.post("/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "E-mail ou senha inválidos")
    return {"access_token": create_token(str(user.id)), "user": user}


@router.post("/auth/register", response_model=UserOut, status_code=201)
def register(payload: PublicRegisterIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if not email.endswith(("@soph.ro.gov.br", "@sophia.ro.gov.br")):
        raise HTTPException(422, "Informe um e-mail institucional da SOPH")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "E-mail já cadastrado")
    sector = db.query(Sector).filter(Sector.name == payload.sector.strip()).first()
    if not sector:
        raise HTTPException(422, "Selecione um setor institucional válido")
    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role="padrao",
        sector_id=sector.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.get("/sectors", response_model=list[SectorOut])
def sectors(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.query(Sector).order_by(Sector.name).all()


@router.post("/sectors", response_model=SectorOut)
def create_sector(payload: SectorIn, db: Session = Depends(get_db), _: User = Depends(admin)):
    sector = Sector(name=payload.name, acronym=payload.acronym.upper())
    db.add(sector)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "Setor ou sigla já cadastrado")
    db.refresh(sector)
    return sector


@router.get("/users", response_model=list[UserOut])
def users(db: Session = Depends(get_db), _: User = Depends(user_manager)):
    return db.query(User).order_by(User.name).all()


@router.post("/users", response_model=UserOut)
def create_user(payload: UserIn, db: Session = Depends(get_db), manager: User = Depends(user_manager)):
    if manager.role != "admin" and payload.role in {"admin", "gerente"}:
        raise HTTPException(403, "Gerentes de TI não podem criar administradores ou outros gerentes")
    user = User(name=payload.name, email=payload.email.lower(), password_hash=hash_password(payload.password),
                role=payload.role, sector_id=payload.sector_id)
    db.add(user)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "E-mail já cadastrado")
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdateIn, db: Session = Depends(get_db),
                manager: User = Depends(user_manager)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Usuário não encontrado")
    if target.id == manager.id and payload.active is False:
        raise HTTPException(400, "Você não pode desativar a própria conta")
    if manager.role != "admin" and (target.role in {"admin", "gerente"} or payload.role in {"admin", "gerente"}):
        raise HTTPException(403, "Gerentes de TI não podem alterar administradores ou outros gerentes")
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        target.name = changes["name"].strip()
    if "role" in changes:
        target.role = changes["role"]
    if "sector_id" in changes:
        target.sector_id = changes["sector_id"]
    if "active" in changes:
        target.active = changes["active"]
    if target.role == "gerente":
        sector = db.get(Sector, target.sector_id) if target.sector_id else None
        if not sector or sector.acronym.upper() != "TI":
            raise HTTPException(422, "O perfil Gerente é exclusivo do setor de Tecnologia da Informação")
    db.commit()
    db.refresh(target)
    return target


@router.put("/users/{user_id}/password")
def change_user_password(user_id: int, payload: PasswordChangeIn, db: Session = Depends(get_db),
                         manager: User = Depends(user_manager)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Usuário não encontrado")
    if manager.role != "admin" and target.role in {"admin", "gerente"}:
        raise HTTPException(403, "Gerentes de TI não podem alterar a senha de administradores ou gerentes")
    target.password_hash = hash_password(payload.password)
    db.commit()
    return {"status": "ok"}


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), manager: User = Depends(user_manager)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Usuário não encontrado")
    if target.id == manager.id:
        raise HTTPException(400, "Você não pode excluir a própria conta")
    if manager.role != "admin" and target.role in {"admin", "gerente"}:
        raise HTTPException(403, "Gerentes de TI não podem excluir administradores ou gerentes")
    # Preserva conversas e auditoria: a exclusão administrativa desativa a conta.
    target.active = False
    db.commit()


@router.get("/knowledge", response_model=list[KnowledgeOut])
def knowledge(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.query(KnowledgeDocument).order_by(KnowledgeDocument.created_at.desc()).all()


@router.post("/knowledge/upload", response_model=KnowledgeOut)
async def upload_knowledge(
    title: str = Form(...), category: str = Form("normativo"), file: UploadFile = File(...),
    db: Session = Depends(get_db), user: User = Depends(current_user),
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".pdf", ".docx", *IMAGE_MIME_TYPES}:
        raise HTTPException(400, "Envie um arquivo PDF, DOCX, PNG, JPG, JPEG ou WEBP")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(413, "O arquivo excede 15 MB")
    safe_name = f"{uuid.uuid4().hex}{suffix}"
    path = Path(get_settings().upload_dir) / safe_name
    path.write_bytes(data)
    if suffix in IMAGE_MIME_TYPES:
        content = f"Imagem anexada para análise pela inteligência artificial: {file.filename or safe_name}"
    else:
        try:
            content = extract_text(path)
        except Exception as exc:
            path.unlink(missing_ok=True)
            raise HTTPException(422, f"Não foi possível extrair o texto: {exc}")
        if not content:
            path.unlink(missing_ok=True)
            raise HTTPException(422, "O arquivo não contém texto extraível")
    item = KnowledgeDocument(title=title, category=category, filename=safe_name,
                             content=content, uploaded_by=user.id)
    db.add(item); db.commit(); db.refresh(item)
    return item


@router.get("/knowledge/{knowledge_id}/file")
def knowledge_file(knowledge_id: int, download: bool = False, db: Session = Depends(get_db), _: User = Depends(current_user)):
    item = db.get(KnowledgeDocument, knowledge_id)
    if not item or not item.filename:
        raise HTTPException(404, "Arquivo não encontrado")
    path = Path(get_settings().upload_dir) / item.filename
    if not path.is_file():
        raise HTTPException(404, "Arquivo não encontrado")
    original_suffix = path.suffix.lower()
    public_name = f"{re.sub(r'[^A-Za-z0-9._-]+', '_', item.title).strip('_') or 'documento'}{original_suffix}"
    media_type = (
        "application/pdf" if original_suffix == ".pdf"
        else IMAGE_MIME_TYPES.get(original_suffix, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    )
    return FileResponse(path, media_type=media_type, filename=public_name if download else None,
                        content_disposition_type="attachment" if download else "inline")


@router.get("/documents", response_model=list[GeneratedOut])
def documents(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [serialize_document(d) for d in db.query(GeneratedDocument).order_by(GeneratedDocument.updated_at.desc()).all()]


@router.get("/documents/{document_id}", response_model=GeneratedOut)
def document(document_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    doc = db.get(GeneratedDocument, document_id)
    if not doc:
        raise HTTPException(404, "Documento não encontrado")
    return serialize_document(doc)


@router.post("/documents/generate", response_model=GeneratedOut)
async def generate_document(payload: GenerateIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = f"{payload.title} {' '.join(str(v) for v in payload.fields.values())}"
    sources = search_sources(db, query)
    content = await generate(payload.document_type, payload.fields, sources, db)
    doc = GeneratedDocument(title=payload.title, document_type=payload.document_type,
                            form_data=json.dumps(payload.fields, ensure_ascii=False),
                            created_by=user.id, sector_id=user.sector_id)
    db.add(doc); db.flush()
    db.add(DocumentVersion(document_id=doc.id, number=1, content=content,
                           sources=json.dumps(sources, ensure_ascii=False), created_by=user.id))
    db.commit(); db.refresh(doc)
    return serialize_document(doc)


@router.post("/documents/{document_id}/versions", response_model=GeneratedOut)
def add_version(document_id: int, payload: VersionIn, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    doc = db.get(GeneratedDocument, document_id)
    if not doc:
        raise HTTPException(404, "Documento não encontrado")
    previous = doc.versions[-1]
    db.add(DocumentVersion(document_id=doc.id, number=previous.number + 1, content=payload.content,
                           sources=previous.sources, change_note=payload.change_note, created_by=user.id))
    doc.updated_at = utc_now()
    db.commit(); db.refresh(doc)
    return serialize_document(doc)


@router.patch("/documents/{document_id}/status", response_model=GeneratedOut)
def set_status(document_id: int, payload: StatusIn, db: Session = Depends(get_db),
               _: User = Depends(current_user)):
    doc = db.get(GeneratedDocument, document_id)
    if not doc:
        raise HTTPException(404, "Documento não encontrado")
    doc.status = payload.status; doc.updated_at = utc_now()
    db.commit(); db.refresh(doc)
    return serialize_document(doc)


@router.post("/review", response_model=ReviewOut)
def review(payload: ReviewIn, _: User = Depends(current_user)):
    revised, observations = review_text(payload.text)
    return {"revised_text": revised, "observations": observations}


@router.get("/documents/{document_id}/export")
def export(document_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    doc = db.get(GeneratedDocument, document_id)
    if not doc:
        raise HTTPException(404, "Documento não encontrado")
    filename = re.sub(r"[^a-zA-Z0-9_-]+", "_", doc.title).strip("_") or "documento"
    return StreamingResponse(make_docx(doc.title, doc.versions[-1].content),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}.docx"'})


@router.get("/conversations")
def conversations(db: Session = Depends(get_db), user: User = Depends(current_user)):
    items = db.query(Conversation).filter(Conversation.user_id == user.id).order_by(Conversation.updated_at.desc()).all()
    changed = False
    for item in items:
        first_user_message = next((message for message in item.messages if message.role == "user"), None)
        if first_user_message:
            summarized = conversation_title(first_user_message.content)
            if item.title != summarized:
                item.title = summarized
                changed = True
    if changed:
        db.commit()
    return [serialize_conversation(item, False) for item in items]


@router.post("/conversations")
def create_conversation(payload: ConversationIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    item = Conversation(title=payload.title.strip() or "Nova conversa", user_id=user.id)
    db.add(item); db.commit(); db.refresh(item)
    return serialize_conversation(item)


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    item = db.get(Conversation, conversation_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Conversa não encontrada")
    return serialize_conversation(item)


@router.post("/conversations/{conversation_id}/messages")
async def send_chat(conversation_id: int, payload: ChatIn, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    item = db.get(Conversation, conversation_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Conversa não encontrada")
    attachments = []
    if payload.attachment_ids:
        attachments = db.query(KnowledgeDocument).filter(KnowledgeDocument.id.in_(payload.attachment_ids)).all()
    inline_files: list[tuple[str, bytes]] = []
    for attachment in attachments:
        if not attachment.filename:
            continue
        attachment_path = Path(get_settings().upload_dir) / attachment.filename
        mime_type = IMAGE_MIME_TYPES.get(attachment_path.suffix.lower())
        if mime_type and attachment_path.is_file():
            inline_files.append((mime_type, attachment_path.read_bytes()))
    source_results = search_sources(db, payload.content, limit=6)
    requested_type = requested_document_type(payload.content)
    type_terms = {
        "Estudo Técnico Preliminar": ("etp", "estudo técnico"),
        "Termo de Referência": ("termo de referência", "modelo de tr"),
        "Despacho": ("despacho",),
        "Memorando": ("memorando",),
        "Ofício": ("ofício",),
        "Portaria": ("portaria",),
        "Edital": ("edital",),
        "Relatório Técnico": ("relatório",),
        "Parecer": ("parecer",),
    }.get(requested_type, ())
    institutional_models = db.query(KnowledgeDocument).all()
    has_requested_model = bool(attachments) or any(
        any(term in f"{doc.category} {doc.title}".casefold() for term in type_terms)
        for doc in institutional_models
    )
    web_results = []
    if is_document_request(payload.content) and not has_requested_model and not requires_specific_model(payload.content):
        web_results = await research_official_documents(payload.content)
    by_id = {source["id"]: source for source in source_results}
    for attachment in attachments:
        by_id[attachment.id] = {
            "id": attachment.id,
            "title": attachment.title,
            # Arquivos anexados pelo usuário têm prioridade e precisam fornecer
            # contexto suficiente para uma redação realmente específica.
            "excerpt": attachment.content[:16000],
        }
    for result in web_results:
        by_id[result["id"]] = result
    sources = list(by_id.values())
    context = "\n\n".join(
        f"[{s['title']}{' - ' + s['url'] if s.get('url') else ''}]\n{s['excerpt']}" for s in sources
    )
    approved_learning = learning_context(db, payload.content)
    if approved_learning:
        context = f"{context}\n\n{approved_learning}".strip()
    history = [{"role": m.role, "content": m.content} for m in item.messages]
    user_message = ChatMessage(conversation_id=item.id, role="user", content=payload.content,
                               attachment_ids=json.dumps(payload.attachment_ids))
    db.add(user_message); db.flush()
    if requires_specific_model(payload.content) and not has_requested_model:
        answer = (
            f"## Modelo específico necessário\n\nPara reproduzir com segurança o padrão solicitado de "
            f"**{requested_type}**, preciso que você anexe ou que um administrador cadastre o documento-modelo "
            "institucional correspondente. Assim que o modelo estiver disponível, elaborarei a minuta diretamente, "
            "sem solicitar novamente as informações já presentes no pedido."
        )
    else:
        answer = await chat_reply(payload.content, context, history, db, inline_files)
    assistant_message = ChatMessage(conversation_id=item.id, role="assistant", content=answer,
                                    sources=json.dumps(sources, ensure_ascii=False))
    db.add(assistant_message)
    db.add(LearningExample(
        user_id=user.id,
        conversation_id=item.id,
        prompt=payload.content,
        response=answer,
        status="pendente",
    ))
    if item.title == "Nova conversa":
        item.title = conversation_title(payload.content)
    item.updated_at = utc_now()
    db.commit(); db.refresh(assistant_message)
    return {"user": {"id": user_message.id, "role": "user", "content": user_message.content,
                     "sources": [], "attachment_ids": payload.attachment_ids},
            "assistant": {"id": assistant_message.id, "role": "assistant", "content": answer,
                          "sources": sources, "attachment_ids": []}}


@router.get("/admin/learning")
def list_learning_examples(db: Session = Depends(get_db), _: User = Depends(admin)):
    examples = db.query(LearningExample).order_by(LearningExample.created_at.desc()).limit(500).all()
    user_names = {
        account.id: account.name
        for account in db.query(User).filter(User.id.in_({example.user_id for example in examples})).all()
    } if examples else {}
    return [{
        "id": example.id,
        "user_id": example.user_id,
        "user_name": user_names.get(example.user_id, "Usuário"),
        "conversation_id": example.conversation_id,
        "prompt": example.prompt,
        "response": example.response,
        "status": example.status,
        "created_at": example.created_at,
        "reviewed_at": example.reviewed_at,
    } for example in examples]


@router.patch("/admin/learning/{example_id}")
def review_learning_example(
    example_id: int,
    payload: LearningStatusIn,
    db: Session = Depends(get_db),
    user: User = Depends(admin),
):
    example = db.get(LearningExample, example_id)
    if not example:
        raise HTTPException(404, "Exemplo de aprendizado não encontrado")
    example.status = payload.status
    example.reviewed_by = user.id if payload.status != "pendente" else None
    example.reviewed_at = utc_now() if payload.status != "pendente" else None
    db.commit()
    return {"id": example.id, "status": example.status}


@router.get("/admin/ai", response_model=AIConfigurationOut)
def get_ai_settings(db: Session = Depends(get_db), _: User = Depends(admin)):
    config = get_ai_configuration(db)
    credential = get_provider_credential(db, config.provider) if config and config.provider == "openai" else None
    return public_configuration(config, credential)


@router.put("/admin/ai", response_model=AIConfigurationOut)
def save_ai_settings(payload: AIConfigurationIn, db: Session = Depends(get_db), user: User = Depends(admin)):
    config = get_ai_configuration(db)
    if not config:
        config = AIConfiguration()
        db.add(config)
    credential = None
    if payload.provider == "openai":
        credential = get_provider_credential(db, "openai")
        if not credential:
            credential = AIProviderCredential(provider="openai", model=payload.model)
            db.add(credential)
        if payload.enabled and not payload.api_key and not credential.api_key_encrypted:
            raise HTTPException(422, "Informe a chave API da OpenAI antes de ativar a integração.")
        credential.model = payload.model
        credential.organization_id = payload.organization_id.strip()
        credential.project_id = payload.project_id.strip()
        if payload.api_key:
            credential.api_key_encrypted = encrypt_api_key(payload.api_key)
        credential.updated_by = user.id
        credential.updated_at = utc_now()
    elif payload.enabled and payload.provider == "gemini" and not payload.api_key and not config.api_key_encrypted:
        raise HTTPException(422, "Informe a chave API do Gemini antes de ativar a integração.")
    config.provider = payload.provider
    config.enabled = payload.enabled
    config.model = payload.model
    if payload.api_key and payload.provider == "gemini":
        config.api_key_encrypted = encrypt_api_key(payload.api_key)
    config.updated_by = user.id
    config.updated_at = utc_now()
    db.commit()
    db.refresh(config)
    if credential:
        db.refresh(credential)
    return public_configuration(config, credential)


@router.post("/admin/ai/test")
async def test_ai_connection(payload: AIConnectionTestIn, db: Session = Depends(get_db), _: User = Depends(admin)):
    config = get_ai_configuration(db)
    if payload.provider == "openai":
        credential = get_provider_credential(db, "openai")
        api_key = payload.api_key or decrypt_api_key(credential.api_key_encrypted if credential else "")
    else:
        credential = None
        api_key = payload.api_key or decrypt_api_key(config.api_key_encrypted if config else "")
    if not api_key:
        raise HTTPException(422, "Informe uma chave API para realizar o teste.")
    try:
        if payload.provider == "openai":
            answer = await openai_generate(
                api_key=api_key,
                model=payload.model,
                prompt="Responda somente com: Conexão validada.",
                system_instruction="Você está verificando a conexão da SOPH.IA com a API OpenAI.",
                max_output_tokens=2048,
                organization_id=payload.organization_id or (credential.organization_id if credential else ""),
                project_id=payload.project_id or (credential.project_id if credential else ""),
            )
        else:
            answer = await gemini_generate(
                api_key=api_key,
                model=payload.model,
                prompt="Responda somente com: Conexão validada.",
                system_instruction=(
                    "Você está verificando a conexão da SOPH.IA com a API Gemini. "
                    "Não explique e não faça análise extensa; responda somente com a frase solicitada."
                ),
                max_output_tokens=1024,
            )
    except (ValueError, httpx.HTTPError) as exc:
        raise HTTPException(422, str(exc))
    provider_name = "OpenAI" if payload.provider == "openai" else "Gemini 3.6 Flash"
    return {"status": "ok", "message": f"Conexão com a {provider_name} validada.", "response": answer}
