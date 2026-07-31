from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.core.security import hash_password
from app.models import ChatMessage, Conversation, KnowledgeDocument, LearningExample, Sector, User
from app.services.generator import conversation_title


def normalize_existing_conversation_titles(db: Session) -> None:
    """Aplica o mesmo padrão de título a conversas de todos os usuários."""
    changed = False
    for conversation in db.query(Conversation).all():
        first_user_message = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.conversation_id == conversation.id,
                ChatMessage.role == "user",
            )
            .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
            .first()
        )
        if not first_user_message:
            continue
        normalized_title = conversation_title(first_user_message.content)
        if conversation.title != normalized_title:
            conversation.title = normalized_title
            changed = True
    if changed:
        db.commit()


def collect_existing_learning_examples(db: Session) -> None:
    """Inclui o histórico anterior na fila, sem duplicar interações já registradas."""
    existing_pairs = {
        (item.conversation_id, item.prompt, item.response)
        for item in db.query(LearningExample).all()
    }
    additions = []
    for conversation in db.query(Conversation).all():
        pending_prompt = None
        for message in conversation.messages:
            if message.role == "user":
                pending_prompt = message.content
            elif message.role == "assistant" and pending_prompt:
                key = (conversation.id, pending_prompt, message.content)
                if key not in existing_pairs:
                    additions.append(LearningExample(
                        user_id=conversation.user_id,
                        conversation_id=conversation.id,
                        prompt=pending_prompt,
                        response=message.content,
                        status="pendente",
                    ))
                    existing_pairs.add(key)
                pending_prompt = None
    if additions:
        db.add_all(additions)
        db.commit()


def seed(db: Session) -> None:
    sector_defaults = [
        ("Presidência", "PRES"),
        ("Diretoria Administrativa e Financeira", "DAF"),
        ("Diretoria Técnica", "DT"),
        ("Tecnologia da Informação", "TI"),
        ("Recursos Humanos", "RH"),
        ("Licitações e Contratos", "LIC"),
        ("Jurídico", "JUR"),
        ("Outro", "OUTRO"),
    ]
    for name, acronym in sector_defaults:
        existing = db.query(Sector).filter(Sector.acronym == acronym).first()
        if existing:
            existing.name = name
        elif not db.query(Sector).filter(Sector.name == name).first():
            db.add(Sector(name=name, acronym=acronym))
    db.commit()
    if db.query(User).count() == 0:
        settings = get_settings()
        if not settings.seed_admin_password or settings.seed_admin_password == "defina-uma-senha-forte":
            raise RuntimeError(
                "Defina SEED_ADMIN_PASSWORD no arquivo .env antes da primeira execução."
            )
        sector = db.query(Sector).filter_by(acronym="TI").first()
        db.add(User(name="Administrador", email=settings.seed_admin_email,
                    password_hash=hash_password(settings.seed_admin_password), role="admin", sector_id=sector.id))
        db.commit()
    if db.query(KnowledgeDocument).count() == 0:
        db.add_all([
            KnowledgeDocument(title="Diretrizes institucionais de redação",
                category="manual", content="As minutas devem usar linguagem clara, impessoal e objetiva. "
                "Informações não fornecidas não podem ser inventadas. Toda minuta exige revisão humana."),
            KnowledgeDocument(title="Checklist demonstrativo de contratação",
                category="checklist", content="O ETP deve descrever necessidade, requisitos, alternativas, "
                "quantitativos, estimativa, resultados, riscos e sustentabilidade. O Termo de Referência deve "
                "manter coerência com o ETP e definir objeto, execução, obrigações, fiscalização e pagamento."),
        ])
        db.commit()
    normalize_existing_conversation_titles(db)
    collect_existing_learning_examples(db)
