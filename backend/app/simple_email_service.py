"""
Email Service - Using SendGrid Web API
More reliable than SMTP, no port/firewall issues
"""

import requests
import json
import os
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# SendGrid Configuration
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", os.getenv("EMAIL_PASS", ""))
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "noreply@personalassistant.com")
SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send"

def send_task_notification_email(to_email: str, task_title: str, task_notes: str = "", task_time: str = ""):
    """
    Send task notification email via SendGrid Web API.
    
    Args:
        to_email: User's email address (from signup)
        task_title: Task title/name
        task_notes: Task description/notes
        task_time: Task due time
    
    Returns:
        bool: True if successful, False if failed
    """
    try:
        if not SENDGRID_API_KEY:
            print(f"⚠️  SendGrid API key not configured. Cannot send email.")
            return False
        
        # Create HTML email body
        html = f"""\
        <html>
            <body style="font-family: Inter, Arial, sans-serif; background-color: #0b0f17; padding: 24px; color: #e6e6e6;">
                <div style="max-width: 640px; margin: 0 auto; background: #121826; padding: 28px; border-radius: 14px; border: 1px solid #1e293b; box-shadow: 0 8px 24px rgba(0,0,0,0.35);">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom: 8px;">
                        <div style="width:32px; height:32px; border-radius:8px; background:#3b82f6; display:flex; align-items:center; justify-content:center; font-weight:700;">S</div>
                        <div style="font-weight:700; letter-spacing:0.2px;">SABA Reminder</div>
                    </div>
                    <h2 style="margin: 12px 0 4px; font-size: 22px; color: #e2e8f0;">I'm reminding you about:</h2>
                    <div style="margin: 12px 0 18px; padding: 14px 16px; background:#0b1220; border:1px solid #1e293b; border-radius:10px;">
                        <div style="font-size:16px; color:#e6e6e6; font-weight:600;">{task_title}</div>
                        {f'<div style="margin-top:8px; font-size:14px; color:#94a3b8;">{task_notes}</div>' if task_notes else ''}
                    </div>
                    <div style="margin-top: 18px; display:flex; gap:12px;">
                        <a href="#" style="background:#22c55e; color:#081016; text-decoration:none; padding:10px 14px; border-radius:8px; font-weight:700; font-size:14px;">Mark as done</a>
                        <a href="#" style="background:#0b1220; color:#9fb3c8; text-decoration:none; padding:10px 14px; border-radius:8px; border:1px solid #1e293b; font-weight:600; font-size:14px;">Snooze 10 min</a>
                    </div>
                    <p style="color: #64748b; font-size: 12px; margin-top: 22px;">
                        This reminder was scheduled by your Personal Assistant. You’re receiving this because you created a task in SABA.
                    </p>
                </div>
            </body>
        </html>
        """

        # Prepare SendGrid API request
        print(f"📧 Sending email via SendGrid Web API...")
        
        headers = {
            "Authorization": f"Bearer {SENDGRID_API_KEY}",
            "Content-Type": "application/json",
        }

        payload = {
            "personalizations": [
                {
                    "to": [{"email": to_email}],
                    "subject": f"⏰ Task Reminder: {task_title}",
                }
            ],
            "from": {"email": SENDER_EMAIL},
            "content": [
                {
                    "type": "text/html",
                    "value": html,
                }
            ],
        }

        print(f"🔐 Authenticating with SendGrid...")
        response = requests.post(SENDGRID_API_URL, json=payload, headers=headers, timeout=10)
        
        if response.status_code == 202:
            print(f"✅ Email sent successfully!")
            print(f"   FROM: {SENDER_EMAIL}")
            print(f"   TO: {to_email}")
            print(f"   TASK: {task_title}")
            return True
        else:
            error_msg = response.text
            print(f"❌ Failed to send email: HTTP {response.status_code}")
            print(f"   Response: {error_msg}")
            return False
            
    except Exception as e:
        print(f"❌ Failed to send email: {str(e)}")
        return False


def test_email():
    """Test the email service"""
    print("\n" + "="*60)
    print("Testing Email Service...")
    print("="*60)
    result = send_task_notification_email(
        to_email="test@example.com",
        task_title="Test Task",
        task_notes="This is a test",
        task_time="2025-10-20 10:00 AM"
    )
    print(f"\nTest Result: {'✅ PASSED' if result else '❌ FAILED'}")
    print("="*60 + "\n")


if __name__ == "__main__":
    test_email()
