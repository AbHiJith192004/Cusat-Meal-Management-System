"""Session revocation and staff-issued account setup codes.

Revision ID: 20260906_security
Revises: ebf0218d2367
"""
from alembic import op
import sqlalchemy as sa
revision = "20260906_security"
down_revision = "ebf0218d2367"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("users", sa.Column("session_version", sa.Integer(), server_default="0", nullable=False))
    op.add_column("users", sa.Column("setup_code_hash", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("setup_code_expires_at", sa.DateTime(timezone=True), nullable=True))

def downgrade():
    op.drop_column("users", "setup_code_expires_at")
    op.drop_column("users", "setup_code_hash")
    op.drop_column("users", "session_version")
