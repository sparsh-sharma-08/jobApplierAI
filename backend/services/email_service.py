import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Dict, Any
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST") or os.getenv("SMTP_SERVER")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER") or os.getenv("SMTP_USERNAME")
SMTP_PASS = os.getenv("SMTP_PASS") or os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM") or SMTP_USER

if not SMTP_USER or not SMTP_PASS:
    raise ValueError("SMTP credentials not set in environment variables")

class EmailService:
    @staticmethod
    def send_email(to_email: str, subject: str, html_content: str):

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = SMTP_FROM
            msg["To"] = to_email

            part = MIMEText(html_content, "html")
            msg.attach(part)

            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(SMTP_FROM, to_email, msg.as_string())
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False

    @staticmethod
    def get_weekly_digest_template(user_name: str, jobs: List[Dict[str, Any]]) -> str:
        job_rows = ""
        for job in jobs:
            score_color = "#10b981" if job['score'] >= 80 else "#f59e0b" if job['score'] >= 60 else "#6b7280"
            job_rows += f"""
            <div style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #f1f5f9;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div style="flex: 1;">
                        <h3 style="margin: 0; color: #0f172a; font-size: 18px; font-weight: 700;">{job['role']}</h3>
                        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">{job['company']} • {job.get('location', 'Remote')}</p>
                    </div>
                    <div style="background-color: {score_color}15; color: {score_color}; padding: 4px 12px; rounded: 999px; font-weight: 700; font-size: 14px; border-radius: 999px; border: 1px solid {score_color}30;">
                        {int(job['score'])}% Match
                    </div>
                </div>
                <div style="margin-top: 12px;">
                    <a href="{job['apply_link']}" style="display: inline-block; background-color: #6366f1; color: #ffffff; padding: 8px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">View & Apply</a>
                </div>
            </div>
            """

        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Weekly Top Matches</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                    <td align="center" style="padding: 40px 20px;">
                        <table width="100%" max-width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 24px; border: 1px solid #e2e8f0; border-collapse: separate; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                            <!-- Header -->
                            <tr>
                                <td style="padding: 40px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); text-align: center;">
                                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: -0.025em;">Weekly Top Matches</h1>
                                    <p style="margin: 12px 0 0 0; color: #e0e7ff; font-size: 16px;">Hand-picked opportunities for {user_name}</p>
                                </td>
                            </tr>
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px;">
                                    <p style="margin: 0 0 32px 0; color: #475569; font-size: 16px; line-height: 1.6;">
                                        Hi {user_name},<br><br>
                                        Our AI has been working hard this week to find jobs that perfectly align with your profile. Here are your <b>Top 5 Matches</b>:
                                    </p>
                                    
                                    {job_rows}
                                    
                                    <div style="margin-top: 32px; text-align: center; padding: 24px; background-color: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0;">
                                        <h4 style="margin: 0; color: #1e293b; font-size: 16px;">Want to see more?</h4>
                                        <p style="margin: 8px 0 20px 0; color: #64748b; font-size: 14px;">Log in to your dashboard to view all new matches and start applying.</p>
                                        <a href="http://localhost:3000/dashboard" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 12px 32px; border-radius: 12px; text-decoration: none; font-size: 15px; font-weight: 600;">Open Dashboard</a>
                                    </div>
                                </td>
                            </tr>
                            <!-- Footer -->
                            <tr>
                                <td style="padding: 32px 40px; background-color: #f1f5f9; text-align: center;">
                                    <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                                        CareerCopilot AI • Your Intelligent Job Search Assistant<br>
                                        You received this email because you're subscribed to weekly top matches.<br>
                                        <a href="http://localhost:3000/settings" style="color: #6366f1; text-decoration: none;">Manage Notifications</a> • <a href="http://localhost:3000/settings" style="color: #6366f1; text-decoration: none;">Unsubscribe</a>
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """

    @staticmethod
    def get_verification_email_template(redirect_url: str) -> str:
        return f"""
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, sans-serif;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                    <td align="center" style="padding: 40px 20px;">
                        <table width="100%" max-width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 24px; border: 1px solid #e2e8f0; overflow: hidden;">
                            <tr>
                                <td style="padding: 40px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); text-align: center;">
                                    <h1 style="margin: 0; color: #ffffff; font-size: 28px;">Verify Your Email</h1>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 40px; text-align: center;">
                                    <p style="color: #475569; font-size: 16px; margin-bottom: 30px;">
                                        Welcome to CareerCopilot AI! Please verify your email address to get started with your automated job search.
                                    </p>
                                    <a href="{redirect_url}" style="display: inline-block; background-color: #10b981; color: #ffffff; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: bold;">Verify Email Address</a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """

    @staticmethod
    def get_reset_password_email_template(redirect_url: str) -> str:
        return f"""
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, sans-serif;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                    <td align="center" style="padding: 40px 20px;">
                        <table width="100%" max-width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 24px; border: 1px solid #e2e8f0; overflow: hidden;">
                            <tr>
                                <td style="padding: 40px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); text-align: center;">
                                    <h1 style="margin: 0; color: #ffffff; font-size: 28px;">Reset Your Password</h1>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 40px; text-align: center;">
                                    <p style="color: #475569; font-size: 16px; margin-bottom: 30px;">
                                        We received a request to reset your password. Click the button below to choose a new password. This link expires in 1 hour.
                                    </p>
                                    <a href="{redirect_url}" style="display: inline-block; background-color: #ef4444; color: #ffffff; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: bold;">Reset Password</a>
                                    <p style="color: #94a3b8; font-size: 14px; margin-top: 30px;">
                                        If you did not request a password reset, please ignore this email.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """

    @staticmethod
    def get_general_notification_template(subject: str, message: str) -> str:
        return f"""
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, sans-serif;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                    <td align="center" style="padding: 40px 20px;">
                        <table width="100%" max-width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 24px; border: 1px solid #e2e8f0; overflow: hidden;">
                            <tr>
                                <td style="padding: 40px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); text-align: center;">
                                    <h1 style="margin: 0; color: #ffffff; font-size: 24px;">{subject}</h1>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 40px; color: #475569; font-size: 16px; line-height: 1.6;">
                                    {message}
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
