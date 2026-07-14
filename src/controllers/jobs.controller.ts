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

// Get all jobs
export const getJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`company.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query.range(from, to);

    const { data: jobs, error, count } = await query;

    if (error) {
      throw new AppError('Failed to fetch jobs', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: {
        jobs: jobs || [],
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

// Get single job
export const getJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !job) {
      throw new AppError('Job not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
};

// Create a job
export const createJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { company, salary, description } = req.body;

    const accessToken = getAccessToken(req);
    if (!accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    
    const db = createUserClient(accessToken);
    const { data: job, error } = await db
      .from('jobs')
      .insert([
        {
          company,
          salary,
          description,
        }
      ])
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to create job', 500, 'DATABASE_ERROR');
    }

    res.status(201).json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
};

// Update a job
export const updateJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const accessToken = getAccessToken(req);
    if (!accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    
    const db = createUserClient(accessToken);
    const { data: job, error } = await db
      .from('jobs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to update job', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
};

// Delete a job
export const deleteJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const accessToken = getAccessToken(req);
    if (!accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    
    const db = createUserClient(accessToken);
    const { error } = await db
      .from('jobs')
      .delete()
      .eq('id', id);

    if (error) {
      throw new AppError('Failed to delete job', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      message: 'Job deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
