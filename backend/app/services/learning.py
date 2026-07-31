import re

from sqlalchemy.orm import Session

from app.models import LearningExample


STOPWORDS = {
    "a", "ao", "aos", "as", "com", "da", "das", "de", "do", "dos", "e",
    "em", "na", "nas", "no", "nos", "o", "os", "para", "por", "que", "um", "uma",
}


def relevant_approved_examples(db: Session, prompt: str, limit: int = 3) -> list[LearningExample]:
    terms = {
        word.casefold()
        for word in re.findall(r"[\wÀ-ÿ]+", prompt)
        if len(word) > 3 and word.casefold() not in STOPWORDS
    }
    if not terms:
        return []
    ranked: list[tuple[int, LearningExample]] = []
    for example in (
        db.query(LearningExample)
        .filter(LearningExample.status == "aprovado")
        .order_by(LearningExample.reviewed_at.desc())
        .limit(250)
        .all()
    ):
        haystack = f"{example.prompt} {example.response}".casefold()
        score = sum(1 for term in terms if term in haystack)
        if score:
            ranked.append((score, example))
    ranked.sort(key=lambda item: (item[0], item[1].id), reverse=True)
    return [example for _, example in ranked[:limit]]


def learning_context(db: Session, prompt: str) -> str:
    examples = relevant_approved_examples(db, prompt)
    if not examples:
        return ""
    blocks = []
    for example in examples:
        blocks.append(
            "EXEMPLO INSTITUCIONAL APROVADO\n"
            f"Pedido anterior: {example.prompt[:1800]}\n"
            f"Resposta aprovada: {example.response[:5000]}"
        )
    return "\n\n".join(blocks)
