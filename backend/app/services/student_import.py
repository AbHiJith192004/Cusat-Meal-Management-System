"""Parsing and validation for the student intake workbook.

Separate from SuperAdminService on purpose: everything here is a pure
function over cell values, so the rules that decide whether a student is
importable can be tested without a database. The service layer does the
inserting.

The workbook is a Google Forms export, which shapes most of what follows:

* Column A is the submission Timestamp, so columns are matched by HEADER
  NAME, never by position. A positional reader takes the timestamp for the
  registration number.
* Form headers carry trailing spaces and change wording between form
  versions, so matching is case-insensitive, whitespace-collapsed, and
  alias-driven.
* Students resubmit to correct themselves, so the same id legitimately
  appears several times and the LATEST submission wins.
* Excel hands back numeric-looking answers as floats: a student id arrives
  as 26021658.0 and a phone as 7510906718.0. str() on those keeps the .0.
"""
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from app.utils.enums import StudentType

# Canonical field -> header spellings seen across form versions. Compared
# after _normalise_header, so case and internal spacing do not matter.
HEADER_ALIASES: dict[str, tuple[str, ...]] = {
    "registration_number": ("student id", "student number", "college id", "registration number", "admission number"),
    "name": ("full name", "name", "student name"),
    "date_of_birth": ("date of birth", "dob", "birth date"),
    "email": ("email address", "email", "email id"),
    "phone": ("phone number", "phone", "mobile", "mobile number", "contact number"),
    "department": ("department", "dept"),
    "course": ("course/programme", "course / programme", "course", "programme", "program", "course/program"),
    "hostel_name": ("lakeside", "which hostel are you in?", "hostel", "hostel name"),
    "student_type": (
        "guest / inmate", "guest/inmate", "inmate/guest", "student type", "resident status",
        "are you a hostel inmate, a guest, or outmess?",
    ),
    "room_number": ("room number", "room", "room no"),
    "photo_url": ("profile picture", "profile photo", "photo", "photo url"),
    "consent": ("consent", "i confirm the details above are correct, and i agree to my details being used to run the hostel mess account and billing."),
    "timestamp": ("timestamp", "submitted at"),
}

REQUIRED_FIELDS = ("registration_number", "name", "date_of_birth")

STATUS_TO_STUDENT_TYPE = {
    "inmate": StudentType.HOSTELLER.value,
    "hosteller": StudentType.HOSTELLER.value,
    "guest": StudentType.DAY_SCHOLAR.value,
    "day scholar": StudentType.DAY_SCHOLAR.value,
    "day_scholar": StudentType.DAY_SCHOLAR.value,
    # Imported like anyone else and then excluded from billing and fines by
    # app/services/mess_membership.py. These rows used to be skipped, which
    # meant the two students who answered outmess had no account at all and
    # would have had to re-register to ever join the mess.
    "outmess": StudentType.OUTMESS.value,
    "out mess": StudentType.OUTMESS.value,
    "out-mess": StudentType.OUTMESS.value,
    "out of mess": StudentType.OUTMESS.value,
}

# Ages outside this band are data-entry errors rather than real students; the
# common one is entering the day the form was filled.
MIN_AGE_YEARS, MAX_AGE_YEARS = 15, 60

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalise_header(value: Any) -> str:
    """Fold a heading to its comparable form.

    Underscores become spaces so a machine-written sheet using
    registration_number matches the same alias as a Form asking
    'Registration number'.
    """
    return re.sub(r"[\s_]+", " ", str(value or "")).strip().lower()


def cell_text(value: Any) -> str:
    """Excel cell to trimmed text, without float artefacts.

    openpyxl returns numeric answers as floats, so a plain str() would turn
    student id 26021658 into '26021658.0' and silently break every lookup.
    """
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()


def build_column_map(header_row: tuple) -> dict[str, int]:
    """Map canonical field names onto column indexes by header text."""
    lookup = {}
    for alias_tuple, canonical in ((a, c) for c, aliases in HEADER_ALIASES.items() for a in aliases):
        lookup[alias_tuple] = canonical

    columns: dict[str, int] = {}
    for index, raw in enumerate(header_row):
        canonical = lookup.get(_normalise_header(raw))
        # First spelling wins, so a later near-duplicate column cannot
        # silently displace the one already matched.
        if canonical and canonical not in columns:
            columns[canonical] = index
    return columns


def missing_required_columns(columns: dict[str, int]) -> list[str]:
    return [f for f in REQUIRED_FIELDS if f not in columns]


def parse_phone(raw: str) -> str | None:
    """Indian mobile number as 10 digits, or None if it is not one."""
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if len(digits) == 10 else None


def parse_date_of_birth(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = cell_text(value)
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).date()  # noqa: DTZ007 - date only
        except ValueError:
            continue
    return None


def implausible_age(dob: date, today: date) -> bool:
    years = (today - dob).days / 365.25
    return not (MIN_AGE_YEARS <= years <= MAX_AGE_YEARS)


@dataclass
class ParsedStudent:
    row: int
    registration_number: str
    name: str
    date_of_birth: date
    email: str | None = None
    phone: str | None = None
    department: str | None = None
    course: str | None = None
    hostel_name: str | None = None
    room_number: str | None = None
    photo_url: str | None = None
    student_type: str = StudentType.HOSTELLER.value
    consent_at: datetime | None = None
    submitted_at: datetime | None = None


@dataclass
class SheetReview:
    """What a whole-sheet pass decided, before anything is written."""

    importable: list[ParsedStudent] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)
    needs_attention: list[dict] = field(default_factory=list)
    total_rows: int = 0

    def skip(self, row: int, registration_number: str, reason: str) -> None:
        self.skipped.append({"row": row, "registration_number": registration_number, "error": reason})


def _hostel_from_cell(raw: str) -> str | None:
    """The older form asked 'Lakeside' as a yes/no rather than naming a hostel."""
    text = raw.strip()
    if not text or text.lower() in {"no", "not applicable", "na", "n/a", "nil"}:
        return None
    if text.lower() == "yes":
        return "Lakeside"
    return text


def _room_from_cell(raw: str) -> str | None:
    """Rooms are text - 29B and 58 A are valid - but placeholders are not."""
    text = raw.strip()
    if not text or text.lower() in {"nil", "na", "n/a", "none", "-"}:
        return None
    return text if len(text) <= 20 else None


def review_rows(header_row: tuple, data_rows: list[tuple], today: date | None = None) -> SheetReview:
    """Validate every row and decide the import set, writing nothing.

    Row numbers are 1-based spreadsheet numbers including the header, so they
    match what the Super Admin sees when they open the file to fix it.
    """
    today = today or date.today()  # noqa: DTZ011 - calendar day is the intent
    review = SheetReview()
    columns = build_column_map(header_row)

    def value(row: tuple, field_name: str) -> str:
        index = columns.get(field_name)
        if index is None or index >= len(row):
            return ""
        return cell_text(row[index])

    by_registration: dict[str, ParsedStudent] = {}
    order: list[str] = []
    # phone -> registration number -> (row, name). Recorded as rows are read,
    # BEFORE any rejection, because the twin of a mistyped-id pair is often
    # the row that gets rejected for some other reason; if this only saw
    # survivors the pair would never meet and nobody would be told.
    contacts: dict[str, dict[str, tuple[int, str]]] = {}

    for offset, row in enumerate(data_rows):
        row_number = offset + 2
        if not row or not any(cell_text(v) for v in row):
            continue
        review.total_rows += 1

        registration_number = value(row, "registration_number").upper()
        name = value(row, "name")
        dob_index = columns.get("date_of_birth")
        dob_raw = row[dob_index] if dob_index is not None and dob_index < len(row) else None

        if not registration_number or not name or dob_raw in (None, ""):
            review.skip(row_number, registration_number,
                        "Missing a required value: student id, full name and date of birth are all needed.")
            continue

        early_phone = parse_phone(value(row, "phone"))
        if early_phone:
            contacts.setdefault(early_phone, {}).setdefault(registration_number, (row_number, name))

        status = value(row, "student_type").strip().lower()

        dob = parse_date_of_birth(dob_raw)
        if dob is None:
            review.skip(row_number, registration_number, "Date of birth is not a date we can read.")
            continue
        if implausible_age(dob, today):
            review.skip(row_number, registration_number,
                        f"Date of birth {dob.isoformat()} is not plausible - it looks like the day the form was filled.")
            continue

        email = value(row, "email").strip().lower() or None
        if email and not _EMAIL_RE.match(email):
            review.skip(row_number, registration_number, f"Email address {email!r} is not a valid address.")
            continue

        phone_raw = value(row, "phone")
        phone = parse_phone(phone_raw) if phone_raw else None

        student_type = STATUS_TO_STUDENT_TYPE.get(status, StudentType.HOSTELLER.value)
        consent_raw = value(row, "consent").strip().lower()
        submitted_at = None
        ts_index = columns.get("timestamp")
        if ts_index is not None and ts_index < len(row) and isinstance(row[ts_index], datetime):
            submitted_at = row[ts_index]

        parsed = ParsedStudent(
            row=row_number,
            registration_number=registration_number,
            name=name,
            date_of_birth=dob,
            email=email,
            phone=phone,
            department=value(row, "department") or None,
            course=value(row, "course") or None,
            hostel_name=_hostel_from_cell(value(row, "hostel_name")),
            room_number=_room_from_cell(value(row, "room_number")),
            photo_url=value(row, "photo_url") or None,
            student_type=student_type,
            consent_at=submitted_at if consent_raw.startswith("i agree") or consent_raw in {"yes", "true"} else None,
            submitted_at=submitted_at,
        )

        # Resubmission: the later answer is the correction. Without a usable
        # timestamp, later in the file wins, which is the order Forms appends.
        existing = by_registration.get(registration_number)
        if existing is None:
            order.append(registration_number)
            by_registration[registration_number] = parsed
        else:
            newer = (
                parsed.submitted_at is not None
                and existing.submitted_at is not None
                and parsed.submitted_at >= existing.submitted_at
            ) or existing.submitted_at is None
            if newer:
                by_registration[registration_number] = parsed

    survivors = [by_registration[r] for r in order]

    # An email may identify only one account, or a password reset cannot
    # resolve. Rejecting both sides is deliberate: there is no way to tell
    # from the sheet which student owns the address.
    seen_email: dict[str, ParsedStudent] = {}
    contested: set[str] = set()
    for student in survivors:
        if not student.email:
            continue
        first = seen_email.get(student.email)
        if first is None:
            seen_email[student.email] = student
        else:
            contested.add(student.email)

    final: list[ParsedStudent] = []
    for student in survivors:
        if student.email and student.email in contested:
            others = [s.registration_number for s in survivors
                      if s.email == student.email and s.registration_number != student.registration_number]
            review.skip(student.row, student.registration_number,
                        f"Email address is also used by {', '.join(others)}; only one account may hold an address.")
            continue
        final.append(student)

    # One person who mistyped their own id submits twice under two different
    # ids, which id-based de-duplication cannot see. Flag rather than drop:
    # only that student can say which id is theirs, and a shared phone is
    # sometimes legitimate.
    #
    # Run over every survivor, not just the ones being imported. The first
    # time this was written it checked the import set only, and missed the
    # real case in the live sheet: the student's second submission had also
    # mistyped their email, so it had already been rejected and the pair
    # never met. A rejected twin is exactly when a human most needs telling.
    imported = {s.registration_number for s in final}
    for holders in contacts.values():
        if len(holders) > 1:
            registrations = sorted(holders)
            review.needs_attention.append({
                "issue": "Same phone number under different student ids - possibly one person registered twice.",
                "rows": [holders[r][0] for r in registrations],
                "registration_numbers": registrations,
                "names": [holders[r][1] for r in registrations],
                "being_imported": [r for r in registrations if r in imported],
            })

    review.importable = final
    return review
