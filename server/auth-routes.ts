import express, { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as db from './db';
import { ONE_YEAR_MS } from '@shared/const';

const router = Router();

// Login endpoint
router.post('/login', async (req, res) => {
  console.log('🔵 [AUTH ROUTE] Login endpoint called');
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    console.log('🔵 [AUTH] Login attempt:', email);

    const user = await db.getUserByEmail(email);
    console.log('🔵 [AUTH] User found:', user?.email);

    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last signed in
    await db.updateUserLastSignedIn(user.id);

    // Create JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      process.env.JWT_SECRET || 'secret-key',
      { expiresIn: '1y' }
    );

    console.log('🟢 [AUTH] Login successful for:', user.email);

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('🔴 [AUTH] Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token endpoint
router.post('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key') as any;

    const user = await db.getUserById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('🔴 [AUTH] Verify error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
