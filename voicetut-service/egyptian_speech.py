from __future__ import annotations

import re

# Spoken-only phrasing. Legal amounts, article numbers, ranges and citations are
# never rewritten; the text shown in the chat remains the authoritative answer.
_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    (r"\bوفقًا للمرجع\b", "حسب المرجع"),
    (r"\bوفقا للمرجع\b", "حسب المرجع"),
    (r"\bطبقًا للمرجع\b", "حسب المرجع"),
    (r"\bطبقا للمرجع\b", "حسب المرجع"),
    (r"\bيجب عليك\b", "لازم"),
    (r"\bيجب\b", "لازم"),
    (r"\bيمكنك أن\b", "تقدر"),
    (r"\bيمكنك\b", "تقدر"),
    (r"\bيمكن أن\b", "ممكن"),
    (r"\bإذا كان\b", "لو كان"),
    (r"\bإذا\b", "لو"),
    (r"\bفي حالة\b", "لو"),
    (r"\bلا يجوز\b", "مينفعش"),
    (r"\bلا يمكن\b", "مينفعش"),
    (r"\bيرجى\b", "من فضلك"),
)


def to_egyptian_spoken(text: str) -> str:
    spoken = text.strip()
    for pattern, replacement in _REPLACEMENTS:
        spoken = re.sub(pattern, replacement, spoken)
    spoken = spoken.replace("؛", "،")
    spoken = re.sub(r"\s+", " ", spoken).strip()
    return spoken
