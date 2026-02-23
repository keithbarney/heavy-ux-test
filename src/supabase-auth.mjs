import { createClient } from '@supabase/supabase-js';

const AUTH_OPTS = { autoRefreshToken: false, persistSession: false };
const CHUNK_SIZE = 3180;

export async function supabaseAuth(page, step, config) {
  const { url, serviceRoleKey, anonKey, storageKey, storageType } = config.supabase;
  const { email, password, metadata } = step;

  const admin = createClient(url, serviceRoleKey, { auth: AUTH_OPTS });

  // Delete existing user with this email (idempotent test setup)
  const { data: existing } = await admin.auth.admin.listUsers();
  const existingUser = existing?.users?.find((u) => u.email === email);
  if (existingUser) {
    await admin.auth.admin.deleteUser(existingUser.id);
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata || {},
  });
  if (createErr) throw new Error(`Failed to create user: ${createErr.message}`);

  // Upsert profile if metadata has role/full_name
  if (metadata?.role || metadata?.full_name) {
    const { id, ...fields } = { id: created.user.id, ...metadata };
    const { error: profileErr } = await admin.from('profiles').upsert({ id, ...fields });
    if (profileErr) console.warn(`Profile upsert warning: ${profileErr.message}`);
  }

  const anon = createClient(url, anonKey, { auth: AUTH_OPTS });
  const { data: session, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`Failed to sign in: ${signInErr.message}`);

  await ensureOnAppOrigin(page, config);

  if (storageType === 'cookie') {
    await injectSessionCookies(page, storageKey, session.session);
  } else {
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key, value),
      [storageKey, JSON.stringify(session.session)],
    );
  }

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1000);
}

export async function supabaseSignOut(page, config) {
  const { storageKey, storageType } = config.supabase;

  await ensureOnAppOrigin(page, config);

  if (storageType === 'cookie') {
    await clearSessionCookies(page, storageKey);
  } else {
    await page.evaluate((key) => localStorage.removeItem(key), storageKey);
  }

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
}

async function ensureOnAppOrigin(page, config) {
  if (!page.url() || page.url() === 'about:blank') {
    await page.goto(`http://localhost:${config.port}`, { waitUntil: 'load', timeout: 15000 });
  }
}

async function injectSessionCookies(page, storageKey, session) {
  const encoded = encodeURIComponent(JSON.stringify(session));
  const chunks = [];
  for (let i = 0; i < encoded.length; i += CHUNK_SIZE) {
    chunks.push(encoded.slice(i, i + CHUNK_SIZE));
  }

  await clearSessionCookies(page, storageKey);

  for (let i = 0; i < chunks.length; i++) {
    const name = chunks.length === 1 ? storageKey : `${storageKey}.${i}`;
    await page.evaluate(
      ([n, v]) => { document.cookie = `${n}=${v}; path=/; SameSite=Lax;`; },
      [name, chunks[i]],
    );
  }
}

async function clearSessionCookies(page, storageKey) {
  await page.evaluate((key) => {
    document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;`;
    for (let i = 0; i < 10; i++) {
      document.cookie = `${key}.${i}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;`;
    }
  }, storageKey);
}
