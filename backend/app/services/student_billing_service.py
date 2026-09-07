"""Read published invoices without recomputing any live financial input."""
import uuid
from sqlalchemy import select
from app.models.billing import BillingPeriod, StudentBillSnapshot
from app.services.billing_service import BillingService
from app.utils.exceptions import NotFoundException, ConflictException

class StudentBillingService:
    def __init__(self, session):
        self.session = session

    async def get_bill(self, student_id: uuid.UUID, month: int, year: int) -> dict:
        period = await BillingService(self.session).get_period(month, year)
        if not period or not period.is_published:
            raise NotFoundException(message="The bill has not been published yet.", code="BILL_NOT_PUBLISHED")
        if not period.revision:
            raise ConflictException(message="This legacy bill requires staff reconciliation before display.", code="BILL_RECONCILIATION_REQUIRED")
        snapshot = await self.session.scalar(select(StudentBillSnapshot).where(
            StudentBillSnapshot.period_id == period.id, StudentBillSnapshot.revision == period.revision,
            StudentBillSnapshot.student_id == student_id))
        if not snapshot:
            raise NotFoundException(message="No invoice was issued for this student in this period.", code="STUDENT_BILL_NOT_ISSUED")
        return snapshot.payload

    async def list_published(self, month: int, year: int) -> list[dict]:
        period = await BillingService(self.session).get_period(month, year)
        if not period or not period.is_published:
            raise NotFoundException(message="The bill has not been published yet.", code="BILL_NOT_PUBLISHED")
        if not period.revision:
            raise ConflictException(message="This legacy bill requires staff reconciliation.", code="BILL_RECONCILIATION_REQUIRED")
        rows = (await self.session.execute(select(StudentBillSnapshot).where(
            StudentBillSnapshot.period_id == period.id, StudentBillSnapshot.revision == period.revision))).scalars().all()
        return sorted((row.payload for row in rows), key=lambda b: b['student']['registration_number'])
