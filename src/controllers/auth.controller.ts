// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase';
import { AppError } from '../../shared/src/utils';;

// Register with email/password
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, username, displayName } = req.body;

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

    // Sign up user with Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${frontendUrl}/login`,
        data: {
          username: username || `user_${Date.now()}`,
          display_name: displayName || username || 'Villager',
        },
      },
    });

    if (error) {
      throw new AppError(error.message, 400, 'REGISTRATION_ERROR');
    }

    if (!data.user) {
      throw new AppError('Failed to create user', 500, 'REGISTRATION_ERROR');
    }

    // Profile and wallet are created automatically via database triggers
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        session: data.session,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Login with email/password
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new AppError('Invalid email or password', 401, 'LOGIN_ERROR');
    }

    if (!data.user || !data.session) {
      throw new AppError('Login failed', 500, 'LOGIN_ERROR');
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
          ...data.user.user_metadata,
        },
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Logout
export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.substring(7); // Remove 'Bearer ' prefix

    if (token) {
      await supabase.auth.signOut();
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Get current user
export const getCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    // Get full profile from database
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) {
      throw new AppError('Failed to fetch user profile', 500, 'DATABASE_ERROR');
    }

    // Get wallet balance
    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    res.json({
      success: true,
      data: {
        user: {
          ...(profile as any),
          wallet: wallet || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update profile
export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { username, displayName, bio, location, avatarUrl } = req.body;

    // Check if username is taken (if provided)
    if (username) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .neq('id', req.user.id)
        .single();

      if (existing) {
        throw new AppError('Username already taken', 400, 'USERNAME_TAKEN');
      }
    }

    // Update profile
    const { data, error } = await supabase
      .from('profiles')
      .update({
        username,
        display_name: displayName,
        bio,
        location,
        avatar_url: avatarUrl,
      })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to update profile', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { profile: data },
    });
  } catch (error) {
    next(error);
  }
};

// Google OAuth
export const googleAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { redirectTo } = req.body;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUrl = redirectTo || `${frontendUrl}/dashboard`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) {
      throw new AppError(error.message, 400, 'OAUTH_ERROR');
    }

    res.json({
      success: true,
      data: {
        url: data.url,
      },
    });
  } catch (error) {
    next(error);
  }
};


// Send phone OTP
export const sendPhoneOTP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      throw new AppError('Phone number is required', 400, 'VALIDATION_ERROR');
    }

    const { data, error } = await supabase.auth.signInWithOtp({
      phone,
    });

    if (error) {
      throw new AppError(error.message, 400, 'OTP_ERROR');
    }

    res.json({
      success: true,
      message: 'OTP sent successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
};

// Verify phone OTP
export const verifyPhoneOTP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, token } = req.body;

    if (!phone || !token) {
      throw new AppError('Phone number and token are required', 400, 'VALIDATION_ERROR');
    }

    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });

    if (error) {
      throw new AppError('Invalid or expired OTP', 400, 'OTP_ERROR');
    }

    if (!data.user || !data.session) {
      throw new AppError('Verification failed', 500, 'OTP_ERROR');
    }

    res.json({
      success: true,
      message: 'Phone verified successfully',
      data: {
        user: {
          id: data.user.id,
          phone: data.user.phone,
        },
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

