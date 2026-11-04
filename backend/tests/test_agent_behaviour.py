import asyncio
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import LearningExample
from app.services.generator import chat_reply, normalize_headings
from app.services.learning import relevant_approved_examples


def test_normalize_keeps_acronyms_and_names_in_caps():
    assert normalize_headings("## DESPACHO DO SETOR DFD") == "## Despacho do setor DFD"
    assert normalize_headings("CNPJ: 00.000.000/0001-00") == "CNPJ: 00.000.000/0001-00"
    assert normalize_headings("JOÃO DA SILVA") == "JOÃO DA SILVA"


def test_numbered_and_bold_titles_become_sentence_case():
    assert normalize_headings("1. IDENTIFICAÇÃO DA DEMANDA") == "1. Identificação da demanda"
    assert normalize_headings("**MEMORANDO**") == "**Memorando**"
    assert normalize_headings("MEMORANDO") == "Memorando"


def test_plain_body_text_is_untouched():
    text = "O Termo de Referência segue o modelo do CNPJ informado."
    assert normalize_headings(text) == text


def test_fallback_answers_do_not_leave_placeholders():
    prompts = (
        "Crie um ETP sobre contratação de sistema",
        "Crie um Termo de Referência para licenças",
    )
    for prompt in prompts:
        answer = asyncio.run(chat_reply(prompt, "", [], None, None))
        assert "[INFORMAÇÃO A COMPLETAR]" not in answer
        assert "COMPLETAR" not in answer


def test_learning_requires_strong_match(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'learning.db'}")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    with Session() as db:
        db.add(LearningExample(
            user_id=1,
            conversation_id=1,
            prompt="Memorando sobre licença do Revit para a diretoria",
            response="Texto de memorando sobre licença do Revit.",
            status="aprovado",
            reviewed_at=datetime(2026, 1, 1),
        ))
        db.commit()
        # Pedido que compartilha apenas palavras genéricas não deve reaproveitar o exemplo.
        assert relevant_approved_examples(db, "Crie um documento institucional sobre a minuta") == []
        # Pedido relacionado de fato deve reaproveitar o exemplo como referência.
        assert len(relevant_approved_examples(db, "Memorando sobre licença do Revit")) == 1
    engine.dispose()
