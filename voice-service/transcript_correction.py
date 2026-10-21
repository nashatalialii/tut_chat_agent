from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from rapidfuzz import fuzz

from domain_context import FaqPhrase

_DIACRITICS_RE = re.compile(r"[\u0617-\u061A\u064B-\u0652\u0670\u06D6-\u06ED]")
_PUNCT_RE = re.compile(r"[^0-9A-Za-z\u0600-\u06FF]+")
_DIGIT_TRANS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_CHAR_TRANS = str.maketrans({
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
    "ى": "ي", "ؤ": "و", "ئ": "ي", "ة": "ه",
})

TOKEN_ALIASES = {
    # phones
    "الموبايل": "هاتف", "موبايل": "هاتف", "المبايل": "هاتف", "موبيل": "هاتف",
    "التليفون": "هاتف", "تليفون": "هاتف", "التلفون": "هاتف", "تلفون": "هاتف",
    "الهاتف": "هاتف", "هاتف": "هاتف", "المحمول": "هاتف",
    # Frequent Whisper confusions for Egyptian pronunciation of "تليفون".
    "ستافون": "هاتف", "استافون": "هاتف", "استيفون": "هاتف", "تافون": "هاتف",
    # driving
    "سايق": "قياده", "سواق": "قياده", "بسوق": "قياده", "بسوقها": "قياده",
    "السواقه": "قياده", "سواقه": "قياده", "القياده": "قياده", "قياده": "قياده",
    # vehicle
    "العربيه": "مركبه", "عربيه": "مركبه", "السياره": "مركبه", "سياره": "مركبه",
    "المركبه": "مركبه", "مركبه": "مركبه",
    # plate
    "النمره": "لوحه", "نمره": "لوحه", "النمر": "لوحه", "نمر": "لوحه",
    "اللوحه": "لوحه", "لوحه": "لوحه", "اللوحات": "لوحه", "لوحات": "لوحه",
    # common Egyptian words
    "غرامتها": "غرامه", "الغرامه": "غرامه", "غرامه": "غرامه",
    "المخالفه": "مخالفه", "مخالفه": "مخالفه",
    "العقوبه": "عقوبه", "عقوبتها": "عقوبه", "عقوبه": "عقوبه",
    "الرخصه": "رخصه", "رخصه": "رخصه",
    "السرعه": "سرعه", "سرعه": "سرعه",
    "الاشاره": "اشاره", "اشاره": "اشاره",
    "اتصاب": "اصابه", "مصاب": "اصابه", "اصابه": "اصابه",
    "مات": "وفاه", "متوفي": "وفاه", "وفاه": "وفاه",
}

# These are not "stop words" in the legal matcher. They are only low-value for
# transcript correction scoring so a generic phrase like "الغرامة كام" cannot
# overpower the actual violation word.
LOW_SIGNAL = {
    "لو", "انا", "هو", "هي", "في", "من", "علي", "على", "عن", "ايه", "اي",
    "كام", "قد", "ادفع", "يحصل", "اعمل", "ينفع", "هل", "ده", "دي", "دا",
    "وانا", "و", "يا", "مع", "او", "أو", "اللي", "الي", "جوه", "برا",
    "غرامه", "مخالفه", "عقوبه", "قياده",
}


@dataclass(frozen=True)
class CorrectionResult:
    text: str
    raw_text: str
    applied: bool
    score: float
    margin: float
    faq_id: str | None = None
    intent: str | None = None
    references: tuple[str, ...] = ()
    matched_phrase: str | None = None
    reason: str = "no_match"


def normalize_arabic(text: str) -> str:
    text = text.translate(_DIGIT_TRANS)
    text = _DIACRITICS_RE.sub("", text).replace("ـ", "")
    text = text.translate(_CHAR_TRANS).lower()
    text = _PUNCT_RE.sub(" ", text)
    tokens = [TOKEN_ALIASES.get(token, token) for token in text.split()]
    return " ".join(tokens)


def _tokens(text: str) -> list[str]:
    return [t for t in normalize_arabic(text).split() if t]


def _high_signal_tokens(text: str) -> set[str]:
    return {t for t in _tokens(text) if t not in LOW_SIGNAL and len(t) >= 3}


def _contains_any(normalized: str, terms: Iterable[str]) -> bool:
    # Arabic clitics are commonly attached (e.g. "بسماعة"), so exact token
    # boundaries are too strict for these small safety signatures.
    return any(normalize_arabic(term) in normalized for term in terms if normalize_arabic(term))


def _signature(text: str) -> dict[str, bool]:
    n = normalize_arabic(text)
    return {
        "negative": _contains_any(n, ["مش", "عدم", "بدون", "دون", "من غير", "مفيش"]),
        "death": _contains_any(n, ["وفاة", "مات", "متوفي", "متوفى", "توفى", "توفي", "موت"]),
        "injury": _contains_any(n, ["إصابة", "اصابه", "اتصاب", "مصاب"]),
        "no_accident": _contains_any(n, ["مفيش حادث", "من غير حادث", "بدون حادث", "دون حادث"]),
        "handsfree": _contains_any(n, ["هاند فري", "هاندفري", "سماعة", "سماعه"]),
        "driver_license": _contains_any(n, ["رخصة قيادة", "رخصه قياده", "رخصة السواقة", "رخصه السواقه"]),
        "vehicle_license": _contains_any(n, ["رخصة العربية", "رخصه العربيه", "رخصة المركبة", "رخصه المركبه", "رخصة تسيير", "رخصه تسيير", "رخصة التسيير", "رخصه التسيير"]),
        "front_passenger": _contains_any(n, ["الراكب اللي قدام", "راكب امامي", "الراكب الامامي", "اللي جنبه", "اللي جنبي"]),
    }


def _critical_compatible(query: str, candidate: str) -> bool:
    q = _signature(query)
    c = _signature(candidate)

    # If the ASR heard a legally material qualifier, never erase/change it.
    specific = ("death", "injury", "no_accident", "handsfree", "driver_license", "vehicle_license", "front_passenger")
    for key in specific:
        if q[key] and not c[key]:
            return False
        # Also stop a more-specific legal scenario from being invented when it
        # was not heard in the transcript (e.g. hands-free vs handheld phone,
        # injury vs death, driver licence vs vehicle licence).
        if c[key] and not q[key]:
            return False

    # A spoken negation is material. Require the candidate to express a negative
    # construction too, unless it is the special no-accident signature above.
    if q["negative"] and not c["negative"] and not q["no_accident"]:
        return False

    # Do not flip between two explicitly different licence types.
    if q["driver_license"] and c["vehicle_license"]:
        return False
    if q["vehicle_license"] and c["driver_license"]:
        return False

    # Do not turn injury into death or death into injury.
    if q["death"] and c["injury"] and not c["death"]:
        return False
    if q["injury"] and c["death"] and not c["injury"]:
        return False
    return True


def _same_numbers(query: str, candidate: str) -> bool:
    q_nums = set(re.findall(r"\b\d+\b", normalize_arabic(query)))
    if not q_nums:
        return True
    c_nums = set(re.findall(r"\b\d+\b", normalize_arabic(candidate)))
    return q_nums.issubset(c_nums)


def _score(query: str, candidate: FaqPhrase) -> float:
    qn = normalize_arabic(query)
    cn = normalize_arabic(candidate.phrase)
    if not qn or not cn:
        return 0.0

    phrase_score = (
        0.30 * fuzz.WRatio(qn, cn)
        + 0.25 * fuzz.partial_ratio(qn, cn)
        + 0.25 * fuzz.token_set_ratio(qn, cn)
        + 0.20 * fuzz.ratio(qn, cn)
    )

    q_signal = _high_signal_tokens(query)
    c_signal = _high_signal_tokens(candidate.phrase)
    keyword_signal: set[str] = set()
    for keyword in candidate.keywords:
        keyword_signal.update(_high_signal_tokens(keyword))
    c_signal |= keyword_signal

    overlap = len(q_signal & c_signal)
    if overlap:
        phrase_score += min(12.0, 6.0 + 3.0 * (overlap - 1))

    # Fuzzy domain-token support catches small ASR spelling errors such as
    # "المبايل" while still requiring the surrounding phrase to agree.
    if q_signal and c_signal:
        fuzzy_hits = 0
        for q in q_signal:
            if any(fuzz.ratio(q, c) >= 78 for c in c_signal):
                fuzzy_hits += 1
        if fuzzy_hits:
            phrase_score += min(8.0, fuzzy_hits * 2.5)

    return max(0.0, min(100.0, phrase_score))


def correct_transcript(
    raw_text: str,
    entries: list[FaqPhrase],
    *,
    min_score: float = 78.0,
    min_margin: float = 4.0,
) -> CorrectionResult:
    raw = raw_text.strip()
    if not raw or not entries:
        return CorrectionResult(text=raw, raw_text=raw, applied=False, score=0.0, margin=0.0, reason="empty_or_no_faq")

    # Group by FAQ so multiple variants of the same intent do not artificially
    # reduce the winning margin.
    best_by_faq: dict[str, tuple[float, FaqPhrase]] = {}
    for entry in entries:
        if not _critical_compatible(raw, entry.phrase):
            continue
        if not _same_numbers(raw, entry.phrase):
            continue
        score = _score(raw, entry)
        current = best_by_faq.get(entry.faq_id)
        if current is None or score > current[0]:
            best_by_faq[entry.faq_id] = (score, entry)

    if not best_by_faq:
        return CorrectionResult(text=raw, raw_text=raw, applied=False, score=0.0, margin=0.0, reason="no_safe_candidate")

    ranked = sorted(best_by_faq.values(), key=lambda item: item[0], reverse=True)
    best_score, best = ranked[0]
    second_score = ranked[1][0] if len(ranked) > 1 else 0.0
    margin = best_score - second_score

    # Strong content evidence can tolerate a slightly smaller global fuzzy score.
    overlap = len(_high_signal_tokens(raw) & (_high_signal_tokens(best.phrase) | set().union(*(_high_signal_tokens(k) for k in best.keywords)) if best.keywords else _high_signal_tokens(best.phrase)))
    threshold = min_score - (8.0 if overlap >= 1 else 0.0)

    if best_score < threshold:
        return CorrectionResult(
            text=raw,
            raw_text=raw,
            applied=False,
            score=best_score,
            margin=margin,
            faq_id=best.faq_id,
            intent=best.intent,
            references=best.references,
            matched_phrase=best.phrase,
            reason="score_below_threshold",
        )

    if margin < min_margin and best_score < 92.0:
        return CorrectionResult(
            text=raw,
            raw_text=raw,
            applied=False,
            score=best_score,
            margin=margin,
            faq_id=best.faq_id,
            intent=best.intent,
            references=best.references,
            matched_phrase=best.phrase,
            reason="ambiguous_margin",
        )

    # Use the canonical FAQ query for the RAG input. This is intentionally only
    # allowed after a high-confidence, safety-checked match. The raw ASR text is
    # returned separately for debugging/auditing.
    corrected = best.canonical_question.strip() or best.phrase.strip()
    return CorrectionResult(
        text=corrected,
        raw_text=raw,
        applied=(normalize_arabic(corrected) != normalize_arabic(raw)),
        score=best_score,
        margin=margin,
        faq_id=best.faq_id,
        intent=best.intent,
        references=best.references,
        matched_phrase=best.phrase,
        reason="faq_lock",
    )
