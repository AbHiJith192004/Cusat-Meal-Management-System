"""Preserve opt-in choices when declaring and cancelling holidays."""
from alembic import op
import sqlalchemy as sa
revision = '20260907_holidays'
down_revision = '20260906_bills'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('meal_selections', sa.Column('status_before_holiday', sa.String(20), nullable=True))

def downgrade():
    op.drop_column('meal_selections', 'status_before_holiday')
