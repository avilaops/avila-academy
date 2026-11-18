"""Create a private dump and verify it in a disposable database on applications."""
import os
import secrets
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def run(command, **kwargs):
    result = subprocess.run(["sudo", "-u", "postgres", *command], stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        raise RuntimeError("Falha na operação PostgreSQL: " + result.stderr.decode().strip())
    return result


def main():
    if len(sys.argv) != 2:
        raise RuntimeError("Informe o caminho do teste SQL de isolamento.")
    verification = Path(sys.argv[1]).read_text().encode()
    directory = Path("/opt/avila-academy/backups")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archive = directory / ("academy-" + stamp + "-" + secrets.token_hex(4) + ".dump")
    descriptor = os.open(archive, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as output:
            run(["pg_dump", "--format=custom", "--dbname=academy_db"], stdout=output)
    except Exception:
        archive.unlink(missing_ok=True)
        raise
    database = "academy_verify_" + secrets.token_hex(6)
    run(["createdb", database], stdout=subprocess.PIPE)
    try:
        with archive.open("rb") as source:
            run(["pg_restore", "--exit-on-error", "--dbname=" + database], stdin=source, stdout=subprocess.PIPE)
        run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-d", database], input=verification, stdout=subprocess.PIPE)
        result = run(["psql", "-X", "-At", "-d", database, "-c",
                      "SELECT count(*) FROM academy.schema_migrations WHERE version=1;"], stdout=subprocess.PIPE)
        if result.stdout.strip() != b"1":
            raise RuntimeError("A restauração não contém a versão esperada do esquema.")
        print("Snapshot PostgreSQL criado e restauração com isolamento verificada: " + str(archive))
    finally:
        run(["dropdb", database], stdout=subprocess.PIPE)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
