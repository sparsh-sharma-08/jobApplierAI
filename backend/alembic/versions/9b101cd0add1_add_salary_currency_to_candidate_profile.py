"""add_salary_currency_to_candidate_profile

Adds salary_currency to candidate_profile so preference filtering can do
apples-to-apples currency comparison.

Revision ID: 9b101cd0add1
Revises: aa44eb5fe2c0
Create Date: 2026-10-10 13:11:35.370041

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9b101cd0add1'
down_revision: Union[str, Sequence[str], None] = 'aa44eb5fe2c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add salary_currency column to candidate_profile (default 'USD')."""
    with op.batch_alter_table('candidate_profile', schema=None) as batch_op:
        batch_op.add_column(sa.Column('salary_currency', sa.String(), nullable=True, server_default='USD'))


def downgrade() -> None:
    """Remove salary_currency column from candidate_profile."""
    with op.batch_alter_table('candidate_profile', schema=None) as batch_op:
        batch_op.drop_column('salary_currency')
