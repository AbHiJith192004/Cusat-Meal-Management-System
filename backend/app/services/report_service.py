"""Monthly exports use the same immutable invoice rows as student bills."""
import io
from decimal import Decimal
from xml.sax.saxutils import escape
import openpyxl
from openpyxl.styles import Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from app.services.student_billing_service import StudentBillingService


def sanitize_cell(value):
    if isinstance(value, str) and value.lstrip().startswith(('=', '+', '-', '@', '\t', '\r', '\n')):
        return "'" + value
    return value


class ReportService:
    def __init__(self, session):
        self.session = session

    async def generate_monthly_excel_report(self, year: int, month: int) -> bytes:
        bills = await StudentBillingService(self.session).list_published(month, year)
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Published Bills'
        ws.append(['Registration', 'Student', 'Revision', 'Opted-in days', 'Base charge (INR)', 'Fines (INR)', 'Total (INR)'])
        days = wb.create_sheet('Opted-in Days')
        days.append(['Registration', 'Date', 'Revision'])
        fines = wb.create_sheet('Fine Details')
        fines.append(['Registration', 'Date', 'Meal', 'Amount (INR)', 'Status at publication', 'Revision'])
        totals = [Decimal('0.00')] * 3
        for bill in bills:
            reg = sanitize_cell(bill['student']['registration_number'])
            amounts = [Decimal(bill[key]) for key in ('base_charge', 'total_fines', 'grand_total')]
            totals = [a + b for a, b in zip(totals, amounts)]
            ws.append([reg, sanitize_cell(bill['student']['name']), bill['revision'], bill['effective_days'], *amounts])
            for day in bill['opted_in_days']:
                days.append([reg, day, bill['revision']])
            for fine in bill['fines']:
                fines.append([reg, fine['meal_date'], fine['meal_type'], Decimal(fine['amount']), fine['status'], bill['revision']])
        ws.append(['TOTAL', '', '', sum(b['effective_days'] for b in bills), *totals])
        for sheet in wb:
            sheet.freeze_panes = 'A2'
            sheet.auto_filter.ref = sheet.dimensions
            for cell in sheet[1]:
                cell.font = Font(bold=True, color='FFFFFF')
                cell.fill = PatternFill('solid', fgColor='26384A')
            for column in sheet.columns:
                sheet.column_dimensions[column[0].column_letter].width = min(42, max(16, max(len(str(c.value or '')) for c in column) + 2))
        for row in ws.iter_rows(min_row=2, min_col=5, max_col=7):
            for cell in row:
                cell.number_format = '#,##0.00'
        for row in fines.iter_rows(min_row=2, min_col=4, max_col=4):
            row[0].number_format = '#,##0.00'
        output = io.BytesIO()
        wb.save(output)
        return output.getvalue()

    async def generate_monthly_pdf_report(self, year: int, month: int) -> bytes:
        bills = await StudentBillingService(self.session).list_published(month, year)
        output = io.BytesIO()
        doc = SimpleDocTemplate(output, pagesize=landscape(A4), rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
        styles = getSampleStyleSheet()
        revision = bills[0]['revision'] if bills else 0
        elements = [Paragraph(f'MessConnect: published bills {year}-{month:02d}', styles['Title']),
                    Paragraph(
                        f'Invoice revision {revision} | {len(bills)} students | '
                        'Opted-in days plus recorded non-waived fines | All amounts in INR',
                        styles['Normal'],
                    ), Spacer(1, 16)]
        rows = [['Registration', 'Student', 'Revision', 'Opted-in days', 'Base charge', 'Fines', 'Total']]
        totals = [Decimal('0.00')] * 3
        for bill in bills:
            amounts = [Decimal(bill[key]) for key in ('base_charge', 'total_fines', 'grand_total')]
            totals = [a + b for a, b in zip(totals, amounts)]
            rows.append([Paragraph(escape(bill['student']['registration_number']), styles['Normal']),
                         Paragraph(escape(bill['student']['name']), styles['Normal']),
                         str(bill['revision']), str(bill['effective_days']), *[f'{a:,.2f}' for a in amounts]])
        rows.append(['TOTAL', '', '', str(sum(b['effective_days'] for b in bills)), *[f'{a:,.2f}' for a in totals]])
        table = Table(rows, colWidths=[120, 210, 50, 85, 95, 85, 95], repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#26384A')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F1F5F9')]),
            ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#CBD5E1')),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(table)
        doc.build(elements)
        return output.getvalue()
