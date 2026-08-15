"""Locust load testing script simulating 300 concurrent users against CUSAT Mess Backend."""
import random
from datetime import date, timedelta
from locust import HttpUser, task, between, events


class StudentUser(HttpUser):
    """Simulates a student interacting with the mess system."""
    wait_time = between(1, 5)
    
    def on_start(self):
        """Initial user login setup."""
        self.access_token = None
        self.reg_no = f"STUDENT_{random.randint(100, 999)}"
        # Note: In a live load test against a seeded DB, login retrieves real token
        self.headers = {"Authorization": f"Bearer {self.access_token}"} if self.access_token else {}

    @task(3)
    def view_dashboard(self):
        """Student views dashboard summary."""
        self.client.get("/api/v1/me/dashboard", headers=self.headers)

    @task(3)
    def view_meals(self):
        """Student views weekly meal schedule."""
        self.client.get("/api/v1/meals", headers=self.headers)

    @task(2)
    def update_meal_selection(self):
        """Student updates tomorrow's meal status."""
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        meal_type = random.choice(["BREAKFAST", "LUNCH", "DINNER"])
        status = random.choice(["CONFIRMED", "SKIPPED"])
        self.client.put(
            f"/api/v1/meals/{tomorrow}/{meal_type}",
            json={"status": status},
            headers=self.headers,
        )

    @task(2)
    def generate_qr(self):
        """Student generates QR code for attendance."""
        self.client.get("/api/v1/attendance/qr?meal_type=LUNCH", headers=self.headers)

    @task(1)
    def check_notifications(self):
        """Student checks unread notifications."""
        self.client.get("/api/v1/notifications", headers=self.headers)


class AdminUser(HttpUser):
    """Simulates an admin scanning QR codes and checking dashboards."""
    wait_time = between(1, 3)

    @task(2)
    def view_admin_dashboard(self):
        self.client.get("/api/v1/admin/dashboard")

    @task(2)
    def search_students(self):
        self.client.get("/api/v1/admin/students?query=test")

    @task(1)
    def list_fines(self):
        self.client.get("/api/v1/admin/fines?status=PENDING")
