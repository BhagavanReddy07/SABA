import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { getUserByEmail } from '@/lib/db'; // Import DB functions
import { conversationMemory } from '@/lib/conversation-memory'; // Keep for session/preferences for now
import type { User, UserSession } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Get user from PostgreSQL
    const foundUser = await getUserByEmail(email);
    console.log('Login attempt for email:', email, 'Found user:', foundUser !== null);

    if (!foundUser) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (!foundUser.password) { // 'password' field in User type now holds password_hash from DB
      console.error('User found but no password hash stored:', foundUser.id);
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const isValidPassword = await bcrypt.compare(password, foundUser.password);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Create session
    const session: UserSession = {
      id: uuidv4(),
      userId: foundUser.id,
      token: uuidv4(), // In production, use JWT
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      createdAt: new Date(),
    };

    // Save session marker in memory (tagged to user and a synthetic session conversation)
    await conversationMemory.saveMessage({
      id: uuidv4(),
      role: 'assistant',
      content: `SESSION:${JSON.stringify(session)}`,
      timestamp: new Date(),
      conversationId: `session_${foundUser.id}`,
      userId: foundUser.id,
    });

    // Get user preferences
    const preferences = await conversationMemory.getUserPreferences(foundUser.id);

    return NextResponse.json({
      message: 'Login successful',
      user: {
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
        preferences: preferences || foundUser.preferences
      },
      session: {
        id: session.id,
        token: session.token,
        expiresAt: session.expiresAt
      }
    });

  } catch (error) {
    console.error('Error in login API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
