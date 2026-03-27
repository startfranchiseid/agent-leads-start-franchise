/**
 * server.js
 * Entry point: Menjalankan Express keep-alive server + WhatsApp bot.
 *
 * Kenapa Express?
 * Render (Free Tier) akan "sleep" setelah 15 menit tanpa HTTP request.
 * Express menyediakan endpoint /ping agar UptimeRobot bisa menembaknya
 * setiap 14 menit → server tidak pernah tidur → bot WA aktif 24/7.
 */

import express from 'express';
import { startBot } from './src/bot.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Keep-Alive Endpoint ──────────────────────────────────────────────────────
app.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'WhatsApp Lead Bot is alive 🤖',
    timestamp: new Date().toISOString(),
  });
});

// ─── Root endpoint (opsional, informasi dasar) ───────────────────────────────
app.get('/', (req, res) => {
  res.status(200).send('WhatsApp AI Lead Qualification Bot — Running.');
});

// ─── Jalankan Express Server ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌐 Keep-alive server berjalan di port ${PORT}`);
  console.log(`   Ping endpoint: http://localhost:${PORT}/ping`);
  console.log('   Daftarkan URL Render Anda ke UptimeRobot dengan interval 14 menit.\n');
});

// ─── Jalankan WhatsApp Bot ────────────────────────────────────────────────────
startBot().catch((err) => {
  console.error('💥 Fatal error pada bot:', err);
  process.exit(1);
});
