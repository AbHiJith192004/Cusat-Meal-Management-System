"""Explicit first-administrator creation. Never runs at application startup.

Run from backend: python -m scripts.bootstrap_admin
Password is entered through a hidden terminal prompt, never a CLI argument.
"""
import asyncio
import getpass
import uuid
from sqlalchemy import select, text
from app.database import async_session_factory, close_db
from app.models.user import User
from app.security.password import hash_password

async def main():
    registration = input('New administrator ID: ').strip().upper()
    name = input('Administrator name: ').strip()
    password = getpass.getpass('Password (at least 12 characters): ')
    if not registration or len(registration) > 50 or not name or len(name) > 255 or not 12 <= len(password) <= 128:
        raise SystemExit('Invalid ID, name, or password length.')
    if password != getpass.getpass('Repeat password: '):
        raise SystemExit('Passwords did not match.')
    try:
        async with async_session_factory() as db:
            async with db.begin():
                await db.execute(text('SELECT pg_advisory_xact_lock(734202, 0)'))
                existing = await db.scalar(select(User.id).where(User.role == 'SUPER_ADMIN'))
                if existing:
                    raise SystemExit('A super administrator already exists. Use the authorized admin workflow.')
                db.add(User(id=uuid.uuid4(), registration_number=registration, name=name,
                            password_hash=hash_password(password), role='SUPER_ADMIN', account_status='ACTIVE'))
        print('Administrator created. No other accounts were modified.')
    finally:
        await close_db()

if __name__ == '__main__':
    asyncio.run(main())
