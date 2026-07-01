import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

const SMTP_CONFIG = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
} as const;

let transporterInstance: Transporter | null = null;

async function getEmailTransporter(): Promise<Transporter> {
  if (!transporterInstance) {
    transporterInstance = nodemailer.createTransport(SMTP_CONFIG);
    await transporterInstance.verify();
  }
  return transporterInstance;
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const transporter = await getEmailTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;

  await transporter.sendMail({
    from,
    to: email,
    subject: "Your Serendra Finance login code",
    text: `Your login code is ${code}. It expires in 10 minutes.`,
    html: `
      <p>Your Serendra Finance login code is:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
      <p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
    `,
  });
}
