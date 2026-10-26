"""The policy wording and the claims manual, split into sections to look up."""

import re
from typing import Any

from backend.claims import NotFoundError
from backend.db import DATA

DOCUMENTS = {
    "policy_wording": "policy_wording.md",
    "claims_manual": "claims_manual.md",
}
STOP_WORDS = {"the", "and", "for", "with", "from", "that", "this", "are", "was"}
SEARCH_RESULTS = 5


def read_document(document: str) -> str:
    """Return the text of a document, or raise NotFoundError."""
    if document not in DOCUMENTS:
        raise NotFoundError(f"{document} not found")
    return (DATA / DOCUMENTS[document]).read_text(encoding="utf-8")


def sections(document: str) -> list[dict[str, str]]:
    """Split a document on its ## headings into numbered sections."""
    parts = re.split(r"^## ", read_document(document), flags=re.MULTILINE)[1:]
    return [
        {
            "document": document,
            "section": part.split(".", 1)[0],
            "title": part.splitlines()[0],
            "text": f"## {part.strip()}",
        }
        for part in parts
    ]


def list_sections() -> list[dict[str, Any]]:
    """Return each document's title and the titles of its sections."""
    return [
        {
            "document": document,
            "title": read_document(document).splitlines()[0].removeprefix("# "),
            "sections": [section["title"] for section in sections(document)],
        }
        for document in DOCUMENTS
    ]


def read_section(document: str, section: str) -> dict[str, str]:
    """Return one section of a document in full."""
    for found in sections(document):
        if found["section"] == section:
            return found
    raise NotFoundError(f"Section {section} of {document} not found")


def search(query: str) -> list[dict[str, str]]:
    """Return the sections that match the most words of the query, best first."""
    words = {w for w in re.findall(r"\w+", query.lower()) if w not in STOP_WORDS}
    results = []
    for document in DOCUMENTS:
        for section in sections(document):
            text = section["text"].lower()
            matched = [word for word in words if word in text]
            if matched:
                line = max(
                    section["text"].splitlines(),
                    key=lambda line: sum(word in line.lower() for word in words),
                )
                score = (len(matched), sum(text.count(word) for word in matched))
                results.append((score, section | {"line": line.strip()}))
    results.sort(key=lambda result: result[0], reverse=True)
    return [
        {key: section[key] for key in ["document", "section", "title", "line"]}
        for _, section in results[:SEARCH_RESULTS]
    ]
