/**
 * Study time (plan section 5): the web app sends a heartbeat every 30 s while the tab is
 * visible and the learner is active, plus a last one with `navigator.sendBeacon` when the tab
 * is hidden. A beacon is a POST with a JSON Blob (`content-type: application/json`), which
 * Fastify's default JSON parser handles.
 */
import { API_PREFIX } from '@daily-learning/shared';
import { heartbeatBodySchema, type HeartbeatResponse } from '@daily-learning/shared/api';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../../db/client.js';
import { dailyActivity } from '../../db/schema.js';
import { parseInput } from '../../http.js';
import { clampHeartbeatSeconds, recordActivity } from '../../services/activity.js';
import { localDate, systemClock, type Clock } from '../../services/srs.js';
import { requireUser } from '../auth/routes.js';

export function activityRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  now: Clock = systemClock,
): void {
  app.post(`${API_PREFIX}/activity/heartbeat`, async (request): Promise<HeartbeatResponse> => {
    const user = requireUser(request);
    const { seconds } = parseInput(heartbeatBodySchema, request.body);
    const t = now();
    const added = clampHeartbeatSeconds(seconds);
    if (added > 0) recordActivity(db, user.id, t, { seconds: added });
    const row = db
      .select({ s: dailyActivity.secondsStudied })
      .from(dailyActivity)
      .where(and(eq(dailyActivity.userId, user.id), eq(dailyActivity.date, localDate(t))))
      .get();
    return { added, secondsToday: row?.s ?? 0 };
  });
}
