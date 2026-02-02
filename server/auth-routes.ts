import { Router } from 'express';
import bcrypt from 'bcryptjs';
import * as db from './db';
import { createSessionToken, verifySession } from './_core/auth';
import { ONE_YEAR_MS, COOKIE_NAME } from '@shared/const';
import { getSessionCookieOptions } from './_core/cookies';

const router = Router();

// Login endpoint
router.post('/login', async (req, res) => {
  console.log('🔵 [AUTH ROUTE] Login endpoint called');

  // Always set JSON content type
  res.setHeader('Content-Type', 'application/json');

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    console.log('🔵 [AUTH] Login attempt:', email);

    // Check if database is available
    let user;
    try {
      user = await db.getUserByEmail(email);
    } catch (dbError) {
      console.error('🔴 [AUTH] Database error:', dbError);
      return res.status(503).json({
        error: 'Database connection error. Please try again later.',
        code: 'DB_CONNECTION_ERROR'
      });
    }

    console.log('🔵 [AUTH] User found:', user?.email);

    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last signed in
    try {
      await db.updateUserLastSignedIn(user.id);
    } catch (updateError) {
      console.warn('🟡 [AUTH] Failed to update last signed in:', updateError);
      // Continue login even if this fails
    }

    // Create session token using custom auth
    const sessionToken = await createSessionToken(String(user.id), {
      name: user.name || '',
      email: user.email || '',
      expiresInMs: ONE_YEAR_MS,
    });

    // Set cookie
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    console.log('🟢 [AUTH] Login successful for:', user.email);

    return res.json({
      success: true,
      token: sessionToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error('🔴 [AUTH] Login error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify token endpoint
router.post('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify using custom auth
    const session = await verifySession(token);

    if (!session) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await db.getUserById(session.userId);

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

// Google Calendar OAuth Callback
router.get('/oauth/google/calendar/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send('Missing code or state parameter');
  }

  const merchantId = parseInt(state as string);
  if (isNaN(merchantId)) {
    return res.status(400).send('Invalid merchant ID');
  }

  try {
    const googleCalendar = await import('./_core/googleCalendar');
    const result = await googleCalendar.handleOAuthCallback(code as string, merchantId);

    if (result.success) {
      res.redirect('/merchant/calendar/settings?success=true');
    } else {
      res.redirect(`/merchant/calendar/settings?error=${encodeURIComponent(result.message)}`);
    }
  } catch (error: any) {
    console.error('[OAuth Callback] Error:', error);
    res.redirect(`/merchant/calendar/settings?error=${encodeURIComponent(error.message || 'حدث خطأ')}`);
  }
});

// Google Sheets OAuth Callback
router.get('/oauth/google/sheets/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send('Missing code or state parameter');
  }

  const merchantId = parseInt(state as string);
  if (isNaN(merchantId)) {
    return res.status(400).send('Invalid merchant ID');
  }

  try {
    const googleSheets = await import('./_core/googleSheets');
    const result = await googleSheets.handleOAuthCallback(code as string, merchantId);

    if (result.success) {
      res.redirect('/merchant/sheets/settings?success=true');
    } else {
      res.redirect(`/merchant/sheets/settings?error=${encodeURIComponent(result.message)}`);
    }
  } catch (error: any) {
    console.error('[OAuth Callback] Error:', error);
    res.redirect(`/merchant/sheets/settings?error=${encodeURIComponent(error.message || 'حدث خطأ')}`);
  }
});
