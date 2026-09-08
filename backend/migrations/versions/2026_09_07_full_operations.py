"""Persist menu, ledger, inventory, committee, and payment workflows."""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260907_operations"
down_revision: Union[str, None] = "20260907_holidays"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("menu_publications",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("menu_date", sa.Date(), nullable=False),
        sa.Column("meal_type", sa.String(20), nullable=False),
        sa.Column("items", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("notes", sa.String(500)), sa.Column("published_by", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("menu_date", "meal_type", name="uq_menu_date_meal"))
    op.create_index("ix_menu_publications_menu_date", "menu_publications", ["menu_date"])

    op.create_table("ledger_entries",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False), sa.Column("category", sa.String(80), nullable=False),
        sa.Column("description", sa.String(500), nullable=False), sa.Column("amount", sa.Numeric(12,2), nullable=False),
        sa.Column("vendor", sa.String(160)), sa.Column("reference", sa.String(120)),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("voided_at", sa.DateTime(timezone=True)), sa.Column("voided_by", sa.UUID(), sa.ForeignKey("users.id")),
        sa.Column("void_reason", sa.String(500)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("amount > 0", name="ck_ledger_amount_positive"))
    op.create_index("ix_ledger_entries_entry_date", "ledger_entries", ["entry_date"])
    op.create_index("ix_ledger_kind_date", "ledger_entries", ["kind", "entry_date"])

    op.create_table("inventory_items",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("sku", sa.String(80), unique=True, nullable=False),
        sa.Column("name", sa.String(160), nullable=False), sa.Column("unit", sa.String(32), nullable=False),
        sa.Column("quantity", sa.Numeric(12,3), server_default="0", nullable=False),
        sa.Column("reorder_level", sa.Numeric(12,3), server_default="0", nullable=False),
        sa.Column("unit_cost", sa.Numeric(12,2), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("quantity >= 0", name="ck_inventory_quantity_nonnegative"),
        sa.CheckConstraint("reorder_level >= 0", name="ck_inventory_reorder_nonnegative"),
        sa.CheckConstraint("unit_cost >= 0", name="ck_inventory_cost_nonnegative"))

    op.create_table("inventory_movements",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("item_id", sa.UUID(), sa.ForeignKey("inventory_items.id"), nullable=False),
        sa.Column("quantity_delta", sa.Numeric(12,3), nullable=False), sa.Column("balance_after", sa.Numeric(12,3), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False), sa.Column("reference", sa.String(120)),
        sa.Column("recorded_by", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_inventory_movements_item_id", "inventory_movements", ["item_id"])

    op.create_table("committee_assignments",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("student_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False), sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scope", sa.String(32), server_default="ATTENDANCE_SCANNER", nullable=False),
        sa.Column("assigned_by", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)), sa.Column("revoked_by", sa.UUID(), sa.ForeignKey("users.id")),
        sa.Column("revoke_reason", sa.String(500)), sa.CheckConstraint("ends_at > starts_at", name="ck_committee_time_range"))
    op.create_index("ix_committee_assignments_student_id", "committee_assignments", ["student_id"])
    op.create_index("ix_committee_assignments_ends_at", "committee_assignments", ["ends_at"])

    op.create_table("payment_submissions",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("period_id", sa.UUID(), sa.ForeignKey("billing_periods.id"), nullable=False),
        sa.Column("student_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False), sa.Column("bill_revision", sa.Integer(), nullable=False),
        sa.Column("utr", sa.String(64), unique=True, nullable=False), sa.Column("amount", sa.Numeric(12,2), nullable=False),
        sa.Column("status", sa.String(20), server_default="PENDING", nullable=False),
        sa.Column("reviewed_by", sa.UUID(), sa.ForeignKey("users.id")), sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("review_note", sa.String(500)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("amount > 0", name="ck_payment_amount_positive"),
        sa.UniqueConstraint("period_id", "student_id", "bill_revision", name="uq_payment_bill_revision"))
    op.create_index("ix_payment_submissions_period_id", "payment_submissions", ["period_id"])
    op.create_index("ix_payment_submissions_student_id", "payment_submissions", ["student_id"])


def downgrade() -> None:
    for table in ("payment_submissions", "committee_assignments", "inventory_movements",
                  "inventory_items", "ledger_entries", "menu_publications"):
        op.drop_table(table)
