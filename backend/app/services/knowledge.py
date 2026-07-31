import re
from sqlalchemy.orm import Session
from app.models import KnowledgeDocument

STOP = {"para", "com", "uma", "que", "dos", "das", "por", "como", "este", "esta", "ser"}


def search_sources(db: Session, query: str, limit: int = 4) -> list[dict]:
    terms = {w.lower() for w in re.findall(r"\w+", query) if len(w) > 3 and w.lower() not in STOP}
    ranked = []
    for doc in db.query(KnowledgeDocument).all():
        haystack = f"{doc.title} {doc.content}".lower()
        score = sum(haystack.count(term) for term in terms)
        if score:
            excerpt = doc.content[:700].strip()
            ranked.append((score, {"id": doc.id, "title": doc.title, "excerpt": excerpt}))
    return [item for _, item in sorted(ranked, key=lambda x: x[0], reverse=True)[:limit]]

