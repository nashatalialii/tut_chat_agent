from __future__ import annotations

import re

# Conservative spoken-only substitutions. The displayed legal answer is never
# changed. We intentionally do not rewrite numbers, amounts, article numbers,
# reference IDs, or penalty ranges.
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
    """Make connective wording sound Egyptian while preserving legal facts.

    This transformation is used only for audio. The original answer shown to
    the user and its citations remain untouched.
    """
    spoken = text.strip()
    for pattern, replacement in _REPLACEMENTS:
        spoken = re.sub(pattern, replacement, spoken)

    # Cleaner pauses for TTS without changing words or legal values.
    spoken = spoken.replace("؛", "،")
    spoken = re.sub(r"\s+", " ", spoken).strip()
    return spoken
