import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../../apps/backend/src/server/auth/password-hasher';
import { insertUser } from '../../apps/backend/src/server/db/__fixtures__/test-db';
import * as loginRoute from '../../apps/backend/src/app/api/auth/login/route';
import * as meRoute from '../../apps/backend/src/app/api/auth/me/route';
import { createTestApp } from '../helpers/app';

const PASSWORD = 'integration-generated-password-731';
let passwordHash: string;
let app: ReturnType<typeof createTestApp>;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  app = createTestApp();
});

afterEach(() => {
  app.cleanup();
  expect(app.exists()).toBe(false);
});

describe('file-backed API application in the integration project', () => {
  it('SEC-30: keeps an unexpired session valid after reopening the database', async () => {
    const userId = insertUser(app.db, {
      login: 'restart-user',
      passwordHash,
      firstName: 'Restart',
      lastName: 'Fixture',
    });

    const login = await app.client.post(loginRoute, '/api/auth/login', {
      json: { login: 'restart-user', password: PASSWORD },
    });
    expect(login.status).toBe(200);
    expect(app.exists()).toBe(true);

    app.restart();

    const me = await app.client.get(meRoute, '/api/auth/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { id: userId, login: 'restart-user' } });
  });
});
