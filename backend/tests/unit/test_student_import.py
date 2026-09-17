"""Sheet parsing and the rules that decide who is importable.

All of this runs without a database, which is the point of keeping the logic
in student_import rather than inside the service: the old importer could only
be exercised by actually inserting rows, so none of it was tested.

The awkward cases below are real ones taken from the live intake sheet.
"""
from datetime import date, datetime

import pytest

from app.services.student_import import (
    build_column_map,
    cell_text,
    implausible_age,
    missing_required_columns,
    parse_date_of_birth,
    parse_phone,
    review_rows,
)
from app.utils.enums import StudentType

TODAY = date(2026, 9, 17)

# The live Google Form export, trailing spaces and all.
HEADER = ('Timestamp', 'Student id', 'Full name ', 'Date of birth ', 'Email address ',
          'Phone number ', 'Department ', 'Lakeside ', 'Guest / inmate',
          'Course/programme ', 'Room number ', 'Profile picture ')


def row(student_id=26021658.0, name='SREYAS K V ', dob=datetime(2004, 10, 7),
        email='a@example.com', phone=7510906718.0, dept='DCA', lakeside='No',
        status='Inmate', course='MCA', room=51.0, photo='', ts=datetime(2026, 9, 9, 23, 53)):
    return (ts, student_id, name, dob, email, phone, dept, lakeside, status, course, room, photo)


# --- cell handling -------------------------------------------------------

def test_numeric_cells_do_not_keep_excel_float_artefacts():
    """openpyxl returns these as floats; str() would yield '26021658.0'."""
    assert cell_text(26021658.0) == '26021658'
    assert cell_text(7510906718.0) == '7510906718'


def test_cell_text_handles_dates_blanks_and_text():
    assert cell_text(datetime(2004, 10, 7)) == '2004-10-07'
    assert cell_text(None) == ''
    assert cell_text('  padded  ') == 'padded'


# --- header matching -----------------------------------------------------

def test_columns_are_matched_by_name_not_position():
    """Timestamp occupies column A. A positional reader takes it for the id."""
    columns = build_column_map(HEADER)
    assert columns['registration_number'] == 1
    assert columns['timestamp'] == 0
    assert not missing_required_columns(columns)


def test_header_matching_ignores_case_and_spacing():
    assert build_column_map(('  STUDENT   ID ', 'full name', 'DOB'))['registration_number'] == 0


def test_reordered_columns_still_map_correctly():
    columns = build_column_map(('Full name', 'Date of birth', 'Student id'))
    assert (columns['name'], columns['date_of_birth'], columns['registration_number']) == (0, 1, 2)


def test_newer_form_wording_is_recognised():
    """The replacement form asks the status question as a sentence."""
    columns = build_column_map(('Student ID', 'Full name', 'Date of birth',
                                'Are you a hostel inmate, a guest, or outmess?',
                                'Which hostel are you in?', 'Course / Programme'))
    assert 'student_type' in columns and 'hostel_name' in columns and 'course' in columns


def test_missing_required_columns_are_named():
    assert set(missing_required_columns(build_column_map(('Student id',)))) == {'name', 'date_of_birth'}


# --- field parsing -------------------------------------------------------

@pytest.mark.parametrize('raw,expected', [
    ('7510906718', '7510906718'),
    ('+917905775991', '7905775991'),   # country code, seen in the live sheet
    ('09847012345', '9847012345'),     # leading trunk zero
    ('95448 39837', '9544839837'),     # spaced
    ('12345', None),                   # too short
    ('', None),
])
def test_phone_normalisation(raw, expected):
    assert parse_phone(raw) == expected


def test_date_of_birth_accepts_real_dates_and_common_text_formats():
    assert parse_date_of_birth(datetime(2004, 10, 7)) == date(2004, 10, 7)
    assert parse_date_of_birth('2004-10-07') == date(2004, 10, 7)
    assert parse_date_of_birth('07/10/2004') == date(2004, 10, 7)
    assert parse_date_of_birth('not a date') is None


def test_a_birth_date_of_today_is_implausible():
    """The commonest real error: entering the day the form was filled."""
    assert implausible_age(date(2026, 9, 9), TODAY) is True
    assert implausible_age(date(2004, 10, 7), TODAY) is False


# --- whole-sheet review --------------------------------------------------

def test_a_clean_row_is_importable_and_fully_mapped():
    review = review_rows(HEADER, [row()], today=TODAY)
    assert len(review.importable) == 1
    student = review.importable[0]
    assert student.registration_number == '26021658'
    assert student.name == 'SREYAS K V'          # trimmed
    assert student.date_of_birth == date(2004, 10, 7)
    assert student.phone == '7510906718'
    assert student.student_type == StudentType.HOSTELLER.value
    assert student.row == 2                       # spreadsheet row, header included


def test_outmess_students_are_skipped_with_a_reason_not_an_error():
    review = review_rows(HEADER, [row(status='Outmess')], today=TODAY)
    assert review.importable == []
    assert 'not a mess member' in review.skipped[0]['error'].lower()


def test_status_maps_to_student_type():
    assert review_rows(HEADER, [row(status='Guest')], today=TODAY)\
        .importable[0].student_type == StudentType.DAY_SCHOLAR.value
    assert review_rows(HEADER, [row(status='inmate')], today=TODAY)\
        .importable[0].student_type == StudentType.HOSTELLER.value


def test_resubmission_keeps_the_later_answer():
    """Students resubmit to correct themselves; the newer row is the fix."""
    early = row(room=32.0, ts=datetime(2026, 9, 9, 10, 0))
    late = row(room=31.0, ts=datetime(2026, 9, 15, 10, 0))
    review = review_rows(HEADER, [early, late], today=TODAY)
    assert len(review.importable) == 1
    assert review.importable[0].room_number == '31'


def test_resubmission_order_is_by_timestamp_not_file_order():
    late_first = row(room=31.0, ts=datetime(2026, 9, 15, 10, 0))
    early_second = row(room=32.0, ts=datetime(2026, 9, 9, 10, 0))
    assert review_rows(HEADER, [late_first, early_second], today=TODAY)\
        .importable[0].room_number == '31'


def test_rows_missing_a_required_value_are_skipped_with_their_row_number():
    review = review_rows(HEADER, [row(), row(student_id='', name='No Id')], today=TODAY)
    assert len(review.importable) == 1
    assert review.skipped[0]['row'] == 3


def test_an_address_may_identify_only_one_account():
    """Both sides are rejected: the sheet cannot say which student owns it."""
    review = review_rows(HEADER, [row(student_id=1111.0, email='shared@example.com'),
                                  row(student_id=2222.0, email='shared@example.com')], today=TODAY)
    assert review.importable == []
    assert len(review.skipped) == 2


def test_one_person_registered_under_two_ids_is_flagged_not_merged():
    """Id-based de-duplication cannot see this; only the student can resolve it."""
    review = review_rows(HEADER, [row(student_id=26021573.0, email='a@example.com'),
                                  row(student_id=26021563.0, email='b@example.com')], today=TODAY)
    assert len(review.importable) == 2          # nothing is dropped silently
    assert len(review.needs_attention) == 1
    flagged = review.needs_attention[0]
    assert set(flagged['registration_numbers']) == {'26021573', '26021563'}


def test_a_rejected_twin_still_raises_the_duplicate_flag():
    """The live case: the second submission also mistyped its email, so it was
    already rejected. Checking only the import set missed the pair entirely."""
    review = review_rows(HEADER, [row(student_id=26021573.0, email='real@example.com'),
                                  row(student_id=26021563.0, email='aksha')], today=TODAY)
    assert len(review.importable) == 1
    assert len(review.needs_attention) == 1
    assert review.needs_attention[0]['being_imported'] == ['26021573']


def test_room_numbers_keep_their_block_letters_and_drop_placeholders():
    assert review_rows(HEADER, [row(room='29B')], today=TODAY).importable[0].room_number == '29B'
    assert review_rows(HEADER, [row(room='58 A')], today=TODAY).importable[0].room_number == '58 A'
    assert review_rows(HEADER, [row(room='Nil')], today=TODAY).importable[0].room_number is None


def test_lakeside_yes_no_becomes_a_hostel_name():
    assert review_rows(HEADER, [row(lakeside='Yes')], today=TODAY).importable[0].hostel_name == 'Lakeside'
    assert review_rows(HEADER, [row(lakeside='No')], today=TODAY).importable[0].hostel_name is None


def test_blank_rows_are_ignored_entirely():
    review = review_rows(HEADER, [row(), (None,) * 12, ('', '', '')], today=TODAY)
    assert review.total_rows == 1
    assert review.skipped == []


def test_malformed_email_is_rejected():
    assert review_rows(HEADER, [row(email='aksha')], today=TODAY).importable == []


def test_a_student_without_an_email_is_still_importable():
    """Email is unique where present, but not everyone supplies one."""
    assert len(review_rows(HEADER, [row(email='')], today=TODAY).importable) == 1
