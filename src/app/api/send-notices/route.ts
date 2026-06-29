export const runtime = 'nodejs';

import amqplib from 'amqplib';
import { NextResponse } from 'next/server';

const QUEUE = 'email_dispatch';

const buildEmailHtml = (customerName: string, unitCode: string) => `
  <p>Dear ${customerName},</p>
  <p>Please find attached your disconnection notice for unit <strong>${unitCode}</strong>.</p>
  <p>If you have any questions, please contact the Two Serendra Finance office.</p>
  <p>Two Serendra Finance Team</p>
`;

const buildEmailSubject = (unitCode: string) =>
  `Disconnection Notice — Unit ${unitCode}`;

type EmailJob = {
  to: string;
  customerName: string;
  unitCode: string;
  filename: string;
  pdfBase64: string;
};

export async function POST(request: Request) {
  try {
    const jobs: EmailJob[] = await request.json();

    const connection = await amqplib.connect(process.env.RABBITMQ_URL!);
    const channel = await connection.createChannel();

    await channel.assertQueue(QUEUE, { durable: true });

    for (const job of jobs) {
      const payload = {
        to: job.to,
        subject: buildEmailSubject(job.unitCode),
        html: buildEmailHtml(job.customerName, job.unitCode),
        customerName: job.customerName,
        unitCode: job.unitCode,
        filename: job.filename,
        pdfBase64: job.pdfBase64,
      };

      channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(payload)), {
        persistent: true,
      });
    }

    await channel.close();
    await connection.close();

    return NextResponse.json({ success: true, queued: jobs.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
