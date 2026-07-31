from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session
from app.core.security import decode_token
from app.database import get_db
from app.models import User

bearer = HTTPBearer()


def current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    try:
        user_id = int(decode_token(credentials.credentials))
    except (JWTError, ValueError, KeyError):
        raise HTTPException(401, "Token inválido ou expirado")
    user = db.get(User, user_id)
    if not user or not user.active:
        raise HTTPException(401, "Usuário inativo ou inexistente")
    return user


def admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Acesso restrito a administradores")
    return user


def user_manager(user: User = Depends(current_user)) -> User:
    is_it_manager = (
        user.role == "gerente"
        and user.sector is not None
        and (
            user.sector.acronym.upper() == "TI"
            or user.sector.name.casefold() == "tecnologia da informação"
        )
    )
    if user.role != "admin" and not is_it_manager:
        raise HTTPException(403, "Acesso restrito a administradores e gerentes de TI")
    return user
