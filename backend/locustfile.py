"""Locust load test for the CUSAT Mess backend.

Every virtual user signs in for real and carries a real bearer token. The
previous version set access_token = None and never called /auth/login, so
every request went out unauthenticated and the run only measured how fast the
API returns 401s - throughput looked fine while nothing was exercised.

Prepare accounts first. The users must already exist and be ACTIVE with a
known password; import them, activate them, or seed them in a test database.
Point LOAD_USER_PREFIX/LOAD_USER_COUNT/LOAD_USER_PASSWORD at that set:

    LOAD_USER_PREFIX=LOADTEST LOAD_USER_COUNT=300 LOAD_USER_PASSWORD=... \
    locust -f locustfile.py --headless -u 300 -r 30 -t 3m --host=http://localhost:8000

A user that cannot sign in stops rather than silently generating 401 traffic,
so a misconfigured run fails loudly instead of reporting meaningless numbers.
"""
import os
import random
from datetime import timedelta
from itertools import count

from locust import HttpUser, between, task

from app.utils.timezone import today_ist

USER_PREFIX = os.environ.get('LOAD_USER_PREFIX', 'LOADTEST')
USER_COUNT = int(os.environ.get('LOAD_USER_COUNT', '300'))
USER_PASSWORD = os.environ.get('LOAD_USER_PASSWORD', '')

_seq = count()


class StudentUser(HttpUser):
    """A student checking their dashboard, adjusting meals, and showing a QR."""

    wait_time = between(1, 5)

    def on_start(self):
        if not USER_PASSWORD:
            raise RuntimeError(
                'Set LOAD_USER_PASSWORD to the shared password of the seeded load-test accounts. '
                'Without it every request would run unauthenticated and measure nothing.'
            )
        # Deterministic spread so N virtual users map onto N distinct accounts
        # rather than hammering one: the per-account login limit would throttle
        # a single shared identity and distort the results.
        self.registration_number = f'{USER_PREFIX}{next(_seq) % USER_COUNT:03d}'
        response = self.client.post(
            '/api/v1/auth/login',
            json={'registration_number': self.registration_number, 'password': USER_PASSWORD},
            name='/auth/login',
        )
        if response.status_code != 200:
            raise RuntimeError(
                f'Login failed for {self.registration_number} ({response.status_code}). '
                'Seed the accounts and check LOAD_USER_PASSWORD before trusting a run.'
            )
        self.headers = {'Authorization': 'Bearer ' + response.json()['data']['access_token']}

    @task(3)
    def view_dashboard(self):
        self.client.get('/api/v1/me/dashboard', headers=self.headers, name='/me/dashboard')

    @task(3)
    def view_meals(self):
        self.client.get('/api/v1/meals', headers=self.headers, name='/meals')

    @task(2)
    def update_meal_selection(self):
        # Selections lock at the cutoff the evening before, so target a date
        # far enough ahead that the write is accepted rather than 4xx-ing.
        target = (today_ist() + timedelta(days=3)).isoformat()
        meal_type = random.choice(['BREAKFAST', 'LUNCH', 'DINNER'])
        # Only ever one meal skipped: exactly two is an invalid selection and
        # would measure the validator instead of the write path.
        status = random.choice(['CONFIRMED', 'CONFIRMED', 'SKIPPED'])
        self.client.put(
            f'/api/v1/meals/{target}/{meal_type}',
            json={'status': status},
            headers=self.headers,
            name='/meals/[date]/[meal]',
        )

    @task(2)
    def generate_qr(self):
        self.client.get('/api/v1/attendance/qr?meal_type=LUNCH', headers=self.headers,
                        name='/attendance/qr')

    @task(1)
    def check_notifications(self):
        self.client.get('/api/v1/notifications', headers=self.headers, name='/notifications')
