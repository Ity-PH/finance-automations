import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import amqplib from 'amqplib';
import nodemailer from 'nodemailer';

const QUEUE = 'email_dispatch';

interface EmailJob {
  to: string;
  subject: string;
  body?: string;
  html?: string;
  customerName?: string;
  unitCode?: string;
  filename?: string;
  pdfBase64?: string;
}

async function start() {
  console.log('Worker started. Waiting for jobs...');

  const connection = await amqplib.connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();

  await channel.assertQueue(QUEUE, { durable: true });
  channel.prefetch(1);

  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;

    const job: EmailJob = JSON.parse(msg.content.toString());
    console.log(`Received job: send email to ${job.to}`);

    try {
      // TODO: Create auth credentials once outside callback rather than per message?
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: process.env.EMAIL_USER!,
          clientId: process.env.EMAIL_CLIENT_ID!,
          clientSecret: process.env.EMAIL_CLIENT_SECRET!,
          refreshToken: process.env.EMAIL_REFRESH_TOKEN!,
        },
      });

      // Build mail options based on job type
      const mailOptions: nodemailer.SendMailOptions = {
        from: `Serendra Finance <${process.env.EMAIL_USER}>`,
        to: job.to,
        subject: job.subject,
      };

      if (job.pdfBase64) {
        // New shape: notice with PDF attachment
        mailOptions.html = job.html;
        mailOptions.attachments = [
          {
            filename: job.filename,
            content: Buffer.from(job.pdfBase64, 'base64'),
            contentType: 'application/pdf',
          },
        ];
      } else {
        // Old shape: simple test email
        mailOptions.text = job.body;
        mailOptions.html = `<p>${job.body}</p>`;
      }

      const result = await transporter.sendMail(mailOptions);

      console.log(`Email sent successfully. Message ID: ${result.messageId}`);

      // Respect Gmail rate limits
      await new Promise((resolve) => setTimeout(resolve, 1500));

      channel.ack(msg);
    } catch (error) {
      console.error('Failed to send email:', error);
      channel.nack(msg, false, false); // Do NOT requeue
    }
  });
}

start().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
