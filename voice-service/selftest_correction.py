from pathlib import Path

from domain_context import load_faq_phrases
from transcript_correction import correct_transcript

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
entries = load_faq_phrases(DATA_DIR)

cases = [
    ("لو انا ماسك استافون وانا سايق الغرامه كام", "FAQ-EG-002"),
    ("مسكت المبايل وانا سايق المخالفه كام", "FAQ-EG-002"),
    ("انا سايق ومش لابس الحزام ادفع كام", "FAQ-EG-004"),
    ("رخصه العربيه ضاعت ينفع بدل فاقد", "FAQ-EG-043"),
    ("رخصه القياده ضاعت اعمل بدل فاقد منين", "FAQ-EG-041"),
    ("ماشي عكس السير ومفيش حادث العقوبه", "FAQ-EG-058"),
    ("خبطت واحد واتصاب اعمل ايه والعقوبه", "FAQ-EG-049"),
    ("الفرامل بايظه الغرامه ايه", "FAQ-EG-021"),
]

failed = 0
for question, expected in cases:
    result = correct_transcript(question, entries)
    ok = result.faq_id == expected
    print(("PASS" if ok else "FAIL"), expected, "->", result.faq_id, "|", result.text)
    if not ok:
        failed += 1

raise SystemExit(1 if failed else 0)
