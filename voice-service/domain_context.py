from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

BASE_TERMS = [
    "قانون المرور المصري", "مخالفة", "مخالفات", "غرامة", "العقوبة", "حبس",
    "رخصة", "رخصة قيادة", "رخصة تسيير", "تجديد الرخصة", "بدل فاقد", "بدل تالف",
    "الموبايل", "التليفون", "التلفون", "الهاتف", "سايق", "سواق", "السواقة",
    "حزام الأمان", "السرعة", "سرعة زائدة", "الرادار", "عكس الاتجاه", "عكس السير",
    "اللوحات", "اللوحة", "النمرة", "النمر", "الفرامل", "الخوذة", "الموتوسيكل",
    "التوك توك", "الميكروباص", "التاكسي", "العداد", "الحمولة", "الدخان", "العادم",
    "حادث", "حادثة", "إصابة", "وفاة", "قتل خطأ", "إصابة خطأ", "المصاب",
    "مطب صناعي", "كلبش المرور", "قفل العجلة", "طفاية الحريق", "حقيبة الإسعافات",
    "شنطة الإسعافات", "المثلث العاكس", "الملصق الإلكتروني", "السير بدون رخصة",
    "قطع الإشارة", "إشارة المرور", "رجل المرور", "التصالح", "سحب الرخصة",
    "إلغاء الرخصة", "المادة", "القانون", "العربية", "المركبة",
]


@dataclass(frozen=True)
class FaqPhrase:
    faq_id: str
    intent: str
    phrase: str
    canonical_question: str
    references: tuple[str, ...]
    keywords: tuple[str, ...]


def _clean_phrase(value: str) -> str:
    value = re.sub(r"\s+", " ", value.strip())
    return value.strip(" .،,:;؛!?؟|/\\\"'()[]{}")


def _iter_jsonl(path: Path) -> Iterable[dict]:
    try:
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(obj, dict):
                    yield obj
    except OSError:
        return


def load_domain_terms(data_dir: Path, max_terms: int = 280) -> list[str]:
    ordered: dict[str, None] = {}

    def add(value: object) -> None:
        if not isinstance(value, str):
            return
        phrase = _clean_phrase(value)
        if len(phrase) < 2 or len(phrase) > 60:
            return
        if not any("\u0600" <= ch <= "\u06ff" for ch in phrase) and phrase.upper() != "RFID":
            return
        ordered.setdefault(phrase, None)

    for term in BASE_TERMS:
        add(term)

    faq_dir = data_dir / "faq"
    if faq_dir.exists():
        for path in sorted(faq_dir.glob("*.jsonl")):
            for row in _iter_jsonl(path):
                for keyword in row.get("keywords", []) if isinstance(row.get("keywords"), list) else []:
                    add(keyword)
                # Keep Whisper bias focused on vocabulary, not full questions.
                # Full FAQ variants are used later by the safe post-transcription
                # corrector, where they cannot bias acoustic decoding.
                if len(ordered) >= max_terms:
                    break
            if len(ordered) >= max_terms:
                break

    return list(ordered.keys())[:max_terms]


def load_faq_phrases(data_dir: Path) -> list[FaqPhrase]:
    """Load canonical/variant user questions for safe post-STT domain correction."""
    faq_dir = data_dir / "faq"
    if not faq_dir.exists():
        return []

    seen: set[tuple[str, str]] = set()
    result: list[FaqPhrase] = []

    for path in sorted(faq_dir.glob("*.jsonl")):
        for row in _iter_jsonl(path):
            faq_id = str(row.get("faq_id") or "").strip()
            intent = str(row.get("intent") or "").strip()
            canonical = _clean_phrase(str(row.get("canonical_question") or row.get("query") or ""))
            refs_raw = row.get("references")
            refs = tuple(str(x).strip() for x in refs_raw if str(x).strip()) if isinstance(refs_raw, list) else ()
            kw_raw = row.get("keywords")
            keywords = tuple(_clean_phrase(str(x)) for x in kw_raw if _clean_phrase(str(x))) if isinstance(kw_raw, list) else ()
            if not faq_id or not canonical:
                continue

            phrases: list[str] = [canonical]
            variants = row.get("variants")
            if isinstance(variants, list):
                phrases.extend(str(v) for v in variants if isinstance(v, str))

            for raw in phrases:
                phrase = _clean_phrase(raw)
                if not phrase:
                    continue
                key = (faq_id, phrase)
                if key in seen:
                    continue
                seen.add(key)
                result.append(
                    FaqPhrase(
                        faq_id=faq_id,
                        intent=intent,
                        phrase=phrase,
                        canonical_question=canonical,
                        references=refs,
                        keywords=keywords,
                    )
                )

    return result


def build_hotwords(terms: list[str], max_chars: int = 2200) -> str:
    selected: list[str] = []
    size = 0
    for term in sorted(terms, key=lambda x: (len(x.split()) > 4, len(x), x)):
        extra = len(term) + (2 if selected else 0)
        if size + extra > max_chars:
            break
        selected.append(term)
        size += extra
    return "، ".join(selected)


def build_initial_prompt(terms: list[str], max_chars: int = 1400) -> str:
    prefix = (
        "هذا تسجيل لسؤال قصير باللهجة المصرية عن قانون المرور المصري. "
        "اكتب كلام المتحدث فقط ولا تجب عن السؤال. "
        "حافظ على كلمات المرور المصرية كما قيلت، وميّز بدقة بين رخصة القيادة ورخصة العربية، "
        "وبين الإصابة والوفاة وعدم وجود حادث. "
        "انتبه خصوصًا للمصطلحات التالية: "
    )
    chosen: list[str] = []
    size = len(prefix)
    for term in terms:
        if len(term) > 48 or len(term.split()) > 6:
            continue
        extra = len(term) + 2
        if size + extra > max_chars:
            break
        chosen.append(term)
        size += extra
    return prefix + "، ".join(chosen) + "."
