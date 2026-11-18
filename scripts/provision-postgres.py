"""Run on applications with the PostgreSQL administrator. Never prints credentials."""
import os
import secrets
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

CONFIG = Path("/opt/avila-academy/config/postgres.env")
ROLE = "academy_app"
DATABASE = "academy_db"


def psql(sql=None, database="postgres", filename=None, private=False):
    command = ["sudo", "-u", "postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-d", database, "-At"]
    if filename:
        command.extend(["-f", str(filename)])
    result = subprocess.run(command, input=sql, text=True, capture_output=True)
    if result.returncode:
        detail = "" if private else result.stderr.strip()
        raise RuntimeError("Não foi possível executar a operação PostgreSQL. " + detail)
    return result.stdout.strip()


def main():
    if len(sys.argv) != 3:
        raise RuntimeError("Informe os caminhos da migração e do teste de isolamento.")
    migration, verification = map(Path, sys.argv[1:])
    role_exists = psql("SELECT EXISTS(SELECT FROM pg_roles WHERE rolname='academy_app');") == "t"
    database_exists = psql("SELECT EXISTS(SELECT FROM pg_database WHERE datname='academy_db');") == "t"
    if CONFIG.exists():
        content = CONFIG.read_text()
        connection = urlparse(content.strip().removeprefix("DATABASE_URL="))
        if connection.username != ROLE or connection.hostname != "127.0.0.1" or connection.path != "/" + DATABASE:
            raise RuntimeError("Configuração existente aponta para outro banco.")
        password = connection.password
        if not password or not all(char in "0123456789abcdef" for char in password):
            raise RuntimeError("Configuração existente precisa ser conferida sem rotacionar credenciais.")
    else:
        if role_exists or database_exists:
            raise RuntimeError("Banco ou usuário já existe sem configuração privada. Recupere a configuração existente.")
        password = secrets.token_hex(32)
        CONFIG.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor = os.open(CONFIG, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            stream.write(f"DATABASE_URL=postgresql://{ROLE}:{password}@127.0.0.1:5432/{DATABASE}\n")
    if not role_exists:
        psql(f"CREATE ROLE {ROLE} LOGIN PASSWORD '{password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;", private=True)
    if psql("SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname='academy_app';") != "f":
        raise RuntimeError("O usuário existente tem privilégios incompatíveis. Nenhuma permissão foi alterada.")
    if not database_exists:
        psql("CREATE DATABASE academy_db OWNER postgres;")
    psql(filename=migration, database=DATABASE)
    # A repeated migration must keep the same schema and application permissions.
    psql(filename=migration, database=DATABASE)
    psql("""INSERT INTO academy.academies(id,name) VALUES('abraao','Academia do Abraão') ON CONFLICT(id) DO NOTHING;
    INSERT INTO academy.domains(hostname,tenant) VALUES('academy.avilaops.com','abraao') ON CONFLICT(hostname) DO NOTHING;""", database=DATABASE)
    psql(filename=verification, database=DATABASE)
    environment = {**os.environ, "PGHOST": "127.0.0.1", "PGPORT": "5432", "PGUSER": ROLE,
                   "PGPASSWORD": password, "PGDATABASE": DATABASE}
    result = subprocess.run(["psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c",
                             "SELECT current_user,current_database(),(SELECT count(*) FROM academy.courses);"],
                            env=environment, text=True, capture_output=True)
    if result.returncode or result.stdout.strip() != "academy_app|academy_db|0":
        raise RuntimeError("A conexão do usuário da aplicação não passou na verificação.")
    print("academy_db provisionado. Migração repetível, RLS, vínculos e credencial da aplicação verificados.")
    print("O runtime ainda usa SQLite; a conexão e a migração dos dados do aplicativo permanecem pendentes.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
