from pathlib import Path
import re
import unicodedata
from docx import Document
from pypdf import PdfReader


def normalize_ptbr(value: str) -> str:
    text = unicodedata.normalize("NFC", value or "").replace("\x00", "")
    text = "".join(char for char in text if char in "\n\t" or unicodedata.category(char)[0] != "C")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return normalize_ptbr("\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages))
    if suffix == ".docx":
        doc = Document(str(path))
        return normalize_ptbr("\n".join(p.text for p in doc.paragraphs if p.text.strip()))
    raise ValueError("Formato não suportado. Use PDF ou DOCX.")
