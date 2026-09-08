"""Database-backed auth rate limits."""
from alembic import op
import sqlalchemy as sa
revision = "20260906_limits"
down_revision = "20260906_security"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("auth_rate_limits", sa.Column("key", sa.String(64), primary_key=True),
                    sa.Column("attempts", sa.Integer(), nullable=False),
                    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_auth_rate_limits_expires_at", "auth_rate_limits", ["expires_at"])

def downgrade():
    op.drop_table("auth_rate_limits")
