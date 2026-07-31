from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class SectorIn(BaseModel):
    name: str
    acronym: str


class SectorOut(SectorIn):
    id: int
    model_config = ConfigDict(from_attributes=True)


class UserIn(BaseModel):
    name: str
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8)
    role: Literal["admin", "gerente", "diretor", "padrao", "elaborador", "revisor"] = "padrao"
    sector_id: int | None = None


class PublicRegisterIn(BaseModel):
    name: str = Field(min_length=3, max_length=160)
    sector: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8, max_length=200)


class UserUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=160)
    role: Literal["admin", "gerente", "diretor", "padrao", "elaborador", "revisor"] | None = None
    sector_id: int | None = None
    active: bool | None = None


class PasswordChangeIn(BaseModel):
    password: str = Field(min_length=8, max_length=200)


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    active: bool
    sector_id: int | None
    sector_name: str | None = None
    model_config = ConfigDict(from_attributes=True)


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class KnowledgeOut(BaseModel):
    id: int
    title: str
    category: str
    filename: str | None
    content: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class GenerateIn(BaseModel):
    document_type: Literal["despacho", "memorando", "etp", "termo_referencia"]
    title: str
    fields: dict[str, Any]


class VersionIn(BaseModel):
    content: str = Field(min_length=1)
    change_note: str = "Revisão manual"


class StatusIn(BaseModel):
    status: Literal["rascunho", "em_revisao", "revisado", "aprovado"]


class VersionOut(BaseModel):
    id: int
    number: int
    content: str
    sources: list[dict[str, Any]]
    change_note: str
    created_at: datetime


class GeneratedOut(BaseModel):
    id: int
    title: str
    document_type: str
    status: str
    form_data: dict[str, Any]
    created_by: int
    sector_id: int | None
    created_at: datetime
    updated_at: datetime
    versions: list[VersionOut]


class ReviewIn(BaseModel):
    text: str


class ReviewOut(BaseModel):
    revised_text: str
    observations: list[str]


class ChatIn(BaseModel):
    content: str = Field(min_length=1, max_length=20000)
    attachment_ids: list[int] = []


class ConversationIn(BaseModel):
    title: str = "Nova conversa"


class LearningStatusIn(BaseModel):
    status: Literal["pendente", "aprovado", "rejeitado"]


class AIConfigurationIn(BaseModel):
    provider: Literal["template", "ollama", "gemini", "openai"] = "gemini"
    enabled: bool = True
    model: Literal["gemini-3.6-flash", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"] = "gemini-3.6-flash"
    api_key: str | None = Field(default=None, min_length=20, max_length=500)
    organization_id: str = Field(default="", max_length=120)
    project_id: str = Field(default="", max_length=120)


class AIConfigurationOut(BaseModel):
    provider: str
    enabled: bool
    model: str
    configured: bool
    masked_api_key: str
    organization_id: str = ""
    project_id: str = ""
    updated_at: datetime | None = None


class AIConnectionTestIn(BaseModel):
    api_key: str | None = Field(default=None, min_length=20, max_length=500)
    provider: Literal["gemini", "openai"] = "gemini"
    model: Literal["gemini-3.6-flash", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"] = "gemini-3.6-flash"
    organization_id: str = Field(default="", max_length=120)
    project_id: str = Field(default="", max_length=120)
