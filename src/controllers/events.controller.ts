// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { supabase, createUserClient } from '../services/supabase';
import { AppError } from '../../shared/src/utils';

const getAccessToken = (req: Request): string | undefined => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return undefined;
};

// Get all events
export const getEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true });

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query.range(from, to);

    const { data: events, error, count } = await query;

    if (error) {
      throw new AppError('Failed to fetch events', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: {
        events: events || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count || 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get single event
export const getEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: event, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !event) {
      throw new AppError('Event not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

// Create an event
export const createEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, location, date, description } = req.body;
    
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    
    const db = createUserClient(accessToken);
    // We aren't tracking owner_id in events based on phase 4 schema
    const { data: event, error } = await db
      .from('events')
      .insert([
        {
          title,
          location,
          date,
          description,
        }
      ])
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to create event', 500, 'DATABASE_ERROR');
    }

    res.status(201).json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

// Update an event
export const updateEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const accessToken = getAccessToken(req);
    if (!accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    
    const db = createUserClient(accessToken);
    const { data: event, error } = await db
      .from('events')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to update event', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

// Delete an event
export const deleteEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const accessToken = getAccessToken(req);
    if (!accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    
    const db = createUserClient(accessToken);
    const { error } = await db
      .from('events')
      .delete()
      .eq('id', id);

    if (error) {
      throw new AppError('Failed to delete event', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      message: 'Event deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
