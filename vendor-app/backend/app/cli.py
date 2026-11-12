"""Admin CLI.

Usage:
    python -m app.cli create-admin --username alice
        Prompts for the password interactively. To pipe it in non-interactively:
    printf '%s' "$PASSWORD" | python -m app.cli create-admin --username alice --password-stdin
"""

import argparse
import getpass
import sys

from sqlalchemy import func, select

from app.auth import hash_password
from app.db import get_sessionmaker
from app.models import User

MIN_PASSWORD_LENGTH = 12


def _read_password(from_stdin: bool) -> str:
    if from_stdin:
        return sys.stdin.read().rstrip("\n")
    password = getpass.getpass("Password: ")
    if password != getpass.getpass("Confirm password: "):
        sys.exit("Passwords do not match.")
    return password


def create_admin(username: str, password_stdin: bool) -> None:
    username = username.strip()
    if not username:
        sys.exit("Username must not be empty.")

    password = _read_password(password_stdin)
    if len(password) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")

    with get_sessionmaker()() as db:
        exists = db.scalar(select(User.id).where(func.lower(User.username) == username.lower()))
        if exists:
            sys.exit(f"User '{username}' already exists.")
        db.add(User(username=username, password_hash=hash_password(password), is_admin=True))
        db.commit()
    print(f"Admin user '{username}' created.")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-admin", help="Create an admin user")
    p.add_argument("--username", required=True)
    p.add_argument("--password-stdin", action="store_true", help="Read the password from stdin")

    args = parser.parse_args(argv)
    if args.command == "create-admin":
        create_admin(args.username, args.password_stdin)


if __name__ == "__main__":
    main()
