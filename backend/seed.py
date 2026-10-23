"""Reset the database to the claims queue in data/: uv run -m backend.seed"""

from backend.db import database_path, reset_db


def main() -> None:
    reset_db()
    print(f"Seeded {database_path()}")


if __name__ == "__main__":
    main()
