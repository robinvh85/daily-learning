/** Home data (plan section 5): today's lesson and the dashboard. */
import { API_PREFIX } from '@daily-learning/shared';
import type { DashboardResponse, TodayResponse } from '@daily-learning/shared/api';
import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../../db/client.js';
import { buildToday } from '../../services/daily-plan.js';
import { buildDashboard } from '../../services/dashboard.js';
import { systemClock, type Clock } from '../../services/srs.js';
import { requireUser } from '../auth/routes.js';

export function todayRoutes(app: FastifyInstance, db: AppDatabase, now: Clock = systemClock): void {
  app.get(`${API_PREFIX}/today`, async (request): Promise<TodayResponse> => {
    const user = requireUser(request);
    return buildToday(db, user.id, now());
  });

  app.get(`${API_PREFIX}/dashboard`, async (request): Promise<DashboardResponse> => {
    const user = requireUser(request);
    return buildDashboard(db, user.id, now());
  });
}
