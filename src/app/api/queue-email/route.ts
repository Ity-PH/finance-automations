export const runtime = 'nodejs';

import amqplib from 'amqplib';
import { NextResponse } from 'next/server';

const QUEUE = 'email_dispatch';

export async function POST() {
  try {
    const connection = await amqplib.connect(process.env.RABBITMQ_URL!);
    const channel = await connection.createChannel();

    await channel.assertQueue(QUEUE, { durable: true });

    const job = {
      to: process.env.EMAIL_USER,
      subject: 'RabbitMQ Test',
      body: 'This email was queued via RabbitMQ.',
    };

    channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(job)), {
      persistent: true,
    });

    await channel.close();
    await connection.close();

    return NextResponse.json({ success: true, message: 'Job queued' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
