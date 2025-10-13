import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { createUser, getUserByEmail } from '@/lib/db'; // Import DB functions
import { conversationMemory } from '@/lib/conversation-memory'; // Keep for preferences for now
import type { User, UserPreferences, UserSession } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    // Check if user already exists in PostgreSQL
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists with this email' },
        { status: 409 }
      );
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user in PostgreSQL
    const newUser = await createUser({
      email,
      name,
      password_hash: hashedPassword,
    });

    // The createUser function returns a User object without the password_hash
    // We need to reconstruct the User object to match the expected type for the response
    const user: User = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      createdAt: newUser.createdAt,
      isActive: newUser.isActive,
      // password: hashedPassword, // Do not include password in the response
    };

    // Set default preferences
    const defaultPreferences: UserPreferences = {
      theme: 'dark',
      language: 'en',
      timezone: 'UTC',
      communicationStyle: 'friendly',
      notifications: true,
    };

    user.preferences = defaultPreferences;

    console.log('User data saved successfully to PostgreSQL:', user.id);

    // Save user preferences
    await conversationMemory.saveUserPreferences(user.id, defaultPreferences);

    return NextResponse.json({
      message: 'Account created successfully! Please login with your credentials.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        preferences: user.preferences
      }
    });

  } catch (error) {
    console.error('Error in signup API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
