import os

# Valores apenas para testes locais; em produção as variáveis vêm do ambiente ou do .env.
os.environ.setdefault("SECRET_KEY", "chave-de-teste-com-mais-de-32-caracteres")
os.environ.setdefault("SEED_ADMIN_PASSWORD", "senha-de-teste-nao-usada-em-producao")
