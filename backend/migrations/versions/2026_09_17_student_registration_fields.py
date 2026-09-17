"""Student registration fields carried by the intake form.

The Google Form collects email, phone, course, hostel and room number, none
of which had a column. email and phone go on users because they identify the
account and drive password recovery; the rest describe the student and belong
on student_profiles.

Every column is nullable. Existing rows predate the form and have no values,
and the bootstrap super administrator is created from a terminal prompt with
no email at all, so a NOT NULL here would make that script fail.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260917_regfields"
down_revision = "20260907_operations"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("phone", sa.String(20), nullable=True))
    # Unique rather than a plain index: an email that identifies two accounts
    # cannot resolve a password reset. Postgres treats NULLs as distinct, so
    # the accounts without one are unaffected.
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.add_column("student_profiles", sa.Column("course", sa.String(150), nullable=True))
    op.add_column("student_profiles", sa.Column("hostel_name", sa.String(100), nullable=True))
    op.add_column("student_profiles", sa.Column("room_number", sa.String(20), nullable=True))
    op.add_column("student_profiles", sa.Column("consent_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("student_profiles", "consent_at")
    op.drop_column("student_profiles", "room_number")
    op.drop_column("student_profiles", "hostel_name")
    op.drop_column("student_profiles", "course")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "phone")
    op.drop_column("users", "email")
