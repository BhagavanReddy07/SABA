import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import bcrypt from 'bcrypt';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json({ error: 'email and password required' }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 10);
    const res = await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, hash]
    );
    const user = res.rows[0];
    return NextResponse.json({ user });
  } catch (error: any) {
    console.error('signup error', error?.message ?? error);
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
