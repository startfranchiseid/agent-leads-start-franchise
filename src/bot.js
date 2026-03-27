/**
 * src/bot.js
 * Logic inisialisasi WhatsApp via Baileys.
 * Dipanggil oleh server.js setelah Express server aktif.
 *
 * Alur:
 * 1. Login ke WhatsApp (Pairing Code)
 * 2. Sinkronisasi kontak historis → simpan ke Redis (blacklist)
 * 3. Setiap pesan masuk → pipeline: gatekeeper → AI → Sheets → Redis
 */

import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidGroup,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { config } from './config.js';
import { isKnown, addKnown, addManyKnown } from './redis.js';
import { appendLead } from './sheets.js';
import { chat } from './openai.js';
import { getSession, addMessage, clearSession } from './memory.js';

// ─── Logger ──────────────────────────────────────────────────────────────────
const logger = pino({ level: 'silent' }); // Sembunyikan log internal Baileys

// ─── Pesan terima kasih setelah data tersimpan ───────────────────────────────
const THANKS_MESSAGE =
  'Terima kasih banyak kak! Data kebutuhan kakak sudah kami catat dengan baik. ' +
  'Tim konsultan kami akan segera menghubungi kakak untuk informasi lebih lanjut mengenai paket kemitraan yang sesuai. ' +
  'Semoga sukses selalu! 🙏';

/**
 * Memulai koneksi WhatsApp bot.
 * Dipanggil dari server.js dan akan auto-reconnect jika terputus.
 */
export async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false, // Pairing code, bukan QR
  });

  // ── Simpan kredensial setiap ada update ──────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ── Pairing Code Login ───────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Jika belum terdaftar, minta pairing code
    if (qr && !sock.authState.creds.registered) {
      try {
        const pairingCode = await sock.requestPairingCode(config.waPhoneNumber);
        console.log('\n========================================');
        console.log(`📱 Pairing Code: ${pairingCode}`);
        console.log('Buka WhatsApp → Pengaturan → Perangkat Tertaut');
        console.log('Pilih "Tautkan dengan nomor telepon" lalu masukkan kode di atas.');
        console.log('========================================\n');
      } catch (err) {
        console.error('❌ Gagal mendapatkan pairing code:', err.message);
      }
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp terhubung!');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`🔴 Koneksi terputus (kode: ${code}). Reconnect: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(startBot, 5000);
      }
    }
  });

  // ── Fase 1: Sinkronisasi kontak historis ke Redis ────────────────────────
  sock.ev.on('chats.set', async ({ chats }) => {
    try {
      console.log(`📋 Sinkronisasi: ${chats.length} chat historis ditemukan.`);
      const jids = chats
        .map((c) => c.id)
        .filter((id) => id && !isJidGroup(id));
      await addManyKnown(jids);
    } catch (err) {
      console.error('❌ Error sinkronisasi kontak:', err.message);
    }
  });

  // ── Fase 2: Handler Pesan Masuk ──────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await handleMessage(sock, msg);
      } catch (err) {
        console.error(`❌ Error memproses pesan dari ${msg.key?.remoteJid}:`, err.message);
      }
    }
  });
}

/**
 * Memproses satu pesan masuk melalui pipeline lengkap.
 * @param {Object} sock - Instance Baileys socket
 * @param {Object} msg  - Objek pesan dari Baileys
 */
async function handleMessage(sock, msg) {
  const jid = msg.key?.remoteJid;
  if (!jid) return;

  // Abaikan pesan dari bot sendiri
  if (msg.key.fromMe) return;

  // Abaikan pesan grup
  if (isJidGroup(jid)) return;

  // Ekstrak teks pesan
  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    '';

  if (!text.trim()) return;

  // ── Gatekeeper Redis ─────────────────────────────────────────────────────
  const known = await isKnown(jid);
  if (known) {
    console.log(`🔕 Diabaikan (sudah dikenal): ${jid}`);
    return;
  }

  console.log(`📨 Pesan baru dari ${jid}: "${text}"`);

  // ── Update session dan panggil AI ────────────────────────────────────────
  addMessage(jid, 'user', text);
  const result = await chat(getSession(jid));

  if (result.type === 'tool_call') {
    // ── Data lengkap: simpan ke Google Sheets ──────────────────────────────
    const { sumber_info, bidang_usaha, biodata, budget, rencana_mulai } = result.args;

    const timestamp = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'short',
      timeStyle: 'short',
    });
    const nomor = jid.split('@')[0];

    await appendLead({ timestamp, nomor, sumber_info, bidang_usaha, biodata, budget, rencana_mulai });

    // Blacklist nomor di Redis → tidak akan direspons lagi
    await addKnown(jid);
    console.log(`🔒 Nomor ${jid} ditambahkan ke Redis.`);

    // Bersihkan session dan kirim pesan penutup
    clearSession(jid);
    await sock.sendMessage(jid, { text: THANKS_MESSAGE });
    console.log(`✅ Lead berhasil dikualifikasi: ${nomor}`);
  } else {
    // ── Percakapan berlanjut ─────────────────────────────────────────────
    addMessage(jid, 'assistant', result.content);
    await sock.sendMessage(jid, { text: result.content });
  }
}
