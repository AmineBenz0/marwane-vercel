"""
Generate a bcrypt password hash using the backend's existing security helper.

Usage:
    python hash_password.py
    python hash_password.py --password "MyStrongPass123!"
"""

import argparse
import getpass
import sys

from app.utils.security import hash_password


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate a bcrypt hash for a password"
    )
    parser.add_argument(
        "--password",
        help="Plaintext password to hash (safer to omit and use the hidden prompt)",
    )
    args = parser.parse_args()

    password = args.password or getpass.getpass("Password to hash: ")
    if not password:
        print("Error: password cannot be empty.")
        return 1

    print(hash_password(password))
    return 0


if __name__ == "__main__":
    sys.exit(main())
