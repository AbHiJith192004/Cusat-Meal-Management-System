"""Immutable opted-in-day invoice revisions; no automatic historical rebilling."""
from alembic import op
import sqlalchemy as sa
revision = '20260906_bills'
down_revision = '20260906_limits'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('billing_periods', sa.Column('revision', sa.Integer(), server_default='0', nullable=False))
    op.add_column('billing_periods', sa.Column('calculation', sa.JSON(), nullable=True))
    op.create_table('student_bill_snapshots',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('period_id', sa.UUID(), sa.ForeignKey('billing_periods.id'), nullable=False),
        sa.Column('student_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('period_id', 'revision', 'student_id', name='uq_student_bill_revision'))

def downgrade():
    op.drop_table('student_bill_snapshots')
    op.drop_column('billing_periods', 'calculation')
    op.drop_column('billing_periods', 'revision')
