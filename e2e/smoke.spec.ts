import { expect, test } from '@playwright/test';

// One end-to-end pass through the product as a new user. Works in demo mode (no LLM keys, as in
// CI) and with real keys — it waits for the reply to finish rather than for specific words.

test('a new user can sign up, chat, add tasks and memories, search, and delete their account', async ({ page }) => {
  const email = `e2e+${Date.now()}@example.com`;

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('actually remembers');
  await page.getByRole('link', { name: /start chatting/i }).click();

  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Name').fill('Robin Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/chat/);
  await expect(page.getByRole('heading', { name: /Robin/ })).toBeVisible();

  // Chat: the reply finishes (memory-trace chip appears) and the conversation lands in the sidebar.
  const note = 'My favourite place is Hampi and I drink filter coffee every morning.';
  await page.getByLabel('Message SABA').fill(note);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Toggle memory trace' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('navigation', { name: 'Conversations' }).getByRole('button').first()).toBeVisible();

  // Tasks panel (open by default on desktop).
  await page.getByLabel('New task').fill('Buy flowers for Hampi trip');
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByText('Buy flowers for Hampi trip')).toBeVisible();

  // Search every message, then jump into the conversation from the hit.
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search conversations and messages').fill('filter coffee');
  const hit = page.getByRole('button', { name: /filter coffee/i }).first();
  await expect(hit).toBeVisible();
  await hit.click();
  // The whole sentence, exactly: in demo mode the chat title is this text truncated ("…filter c…"),
  // shown in the sidebar and header, so a partial match would hit those too.
  await expect(page.getByText(note, { exact: true })).toBeVisible();

  // Memory dialog via Settings: teach SABA a fact by hand.
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: /what saba knows about you/i }).click();
  await page.getByLabel('New memory').fill('User prefers window seats on trains.');
  await page.getByRole('button', { name: 'Add memory' }).click();
  await expect(page.getByText('User prefers window seats on trains.')).toBeVisible();
  await page.getByRole('button', { name: 'Close memory' }).click();

  // Delete the account (Settings → Privacy & data) and land back on the home page.
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('tab', { name: /privacy/i }).click();
  await page.getByLabel(/to confirm/i).fill(email);
  await page.getByRole('button', { name: /delete (my )?account/i }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });

  // The account is really gone.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // (Next's route announcer is also role="alert", so match the message itself.)
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible();
});
