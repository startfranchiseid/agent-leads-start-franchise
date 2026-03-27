/**
 * redis.js
 * Wrapper untuk Upstash Redis menggunakan REST API client.
 * Mengelola SET "known_contacts" sebagai blacklist nomor WhatsApp.
 */

import { Redis } from '@upstash/redis';
import { config } from './config.js';

const redis = new Redis({
  url: config.upstashRedisUrl,
  token: config.upstashRedisToken,
});

const KEY = 'known_contacts';

/**
 * Mengecek apakah nomor sudah dikenal (ada di blacklist).
 * @param {string} jid - Nomor dalam format JID Baileys, e.g. "628123456789@s.whatsapp.net"
 * @returns {Promise<boolean>}
 */
export async function isKnown(jid) {
  const phone = normalizeJid(jid);
  const result = await redis.sismember(KEY, phone);
  return result === 1;
}

/**
 * Menambahkan satu nomor ke blacklist Redis.
 * @param {string} jid
 * @returns {Promise<void>}
 */
export async function addKnown(jid) {
  const phone = normalizeJid(jid);
  await redis.sadd(KEY, phone);
}

/**
 * Menambahkan banyak nomor sekaligus ke blacklist Redis (bulk saat init).
 * @param {string[]} jids - Array JID Baileys
 * @returns {Promise<void>}
 */
export async function addManyKnown(jids) {
  if (!jids || jids.length === 0) return;

  const phones = jids.map(normalizeJid).filter(Boolean);
  if (phones.length === 0) return;

  // Upstash REST client menerima SADD dengan spread members
  await redis.sadd(KEY, ...phones);
  console.log(`✅ Redis: ${phones.length} kontak historis disimpan ke known_contacts`);
}

/**
 * Mengekstrak nomor telepon bersih dari JID Baileys.
 * JID format: "628123456789@s.whatsapp.net" → "628123456789"
 * Abaikan JID grup yang berformat "xxx@g.us"
 * @param {string} jid
 * @returns {string|null}
 */
function normalizeJid(jid) {
  if (!jid || jid.includes('@g.us')) return null;
  return jid.split('@')[0].split(':')[0];
}
