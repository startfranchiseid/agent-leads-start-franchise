/**
 * openai.js
 * Wrapper OpenAI GPT-4o-mini dengan Tool Calling untuk lead qualification.
 * Mengembalikan tipe 'message' untuk reply biasa atau 'tool_call' saat data lengkap.
 */

import OpenAI from 'openai';
import { config } from './config.js';

const openai = new OpenAI({ apiKey: config.openaiApiKey });

// ─── System Prompt (sesuai PRD) ─────────────────────────────────────────────
const SYSTEM_PROMPT = `Anda adalah Asisten Virtual yang ramah dan profesional untuk layanan kemitraan/franchise.
Tugas Anda adalah menyambut pengguna baru yang menghubungi WhatsApp dan mengumpulkan 5 informasi wajib secara berurutan:
1. Sumber info (Dari mana mereka tahu info franchise kami, misal: TikTok, Instagram).
2. Bidang usaha / Brand yang diminati (misal: FnB, Laundry, Kopi Fore, dll).
3. Biodata (Nama lengkap/panggilan beserta domisili atau kota asal).
4. Budget (Anggaran yang disiapkan untuk memulai usaha).
5. Rencana mulai (Kapan rencana target waktu untuk mulai menjalankan usaha ini).

ATURAN KETAT:
- BERTANYALAH SATU ATAU DUA INFORMASI SAJA PER BALASAN. Jangan menanyakan semua informasi sekaligus seperti robot formulir. Buat obrolan mengalir natural.
- Gunakan bahasa Indonesia yang luwes, santai tapi sopan.
- Selalu sisipkan 1 emoji di akhir pesan Anda (misal: 😊, 🙏, 🤔).
- Jika pengguna sudah memberikan kelima informasi di atas, JANGAN membalas dengan teks tanya jawab lagi. LANGSUNG panggil fungsi 'save_lead_to_sheet' dengan data yang telah dikumpulkan.`;

// ─── Tool Schema (sesuai PRD) ────────────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'save_lead_to_sheet',
      description: 'Menyimpan data kualifikasi lead franchise ke database jika semua 5 informasi sudah terkumpul.',
      parameters: {
        type: 'object',
        properties: {
          sumber_info: {
            type: 'string',
            description: 'Sumber informasi darimana mengetahui franchise (Contoh: TikTok, Instagram)',
          },
          bidang_usaha: {
            type: 'string',
            description: 'Bidang usaha atau brand franchise yang diminati (Contoh: FnB, Laundry, Kopi Fore, Maxim)',
          },
          biodata: {
            type: 'string',
            description: 'Nama dan domisili kota asal pengguna (Contoh: Syifa, Rancaekek Kab Bandung)',
          },
          budget: {
            type: 'string',
            description: 'Anggaran yang disiapkan (Contoh: 15jt kebawah, under 50jt, 10 s.d 30 jt)',
          },
          rencana_mulai: {
            type: 'string',
            description: 'Waktu mulai usaha yang direncanakan (Contoh: secepatnya, maret, masih difikirkan)',
          },
        },
        required: ['sumber_info', 'bidang_usaha', 'biodata', 'budget', 'rencana_mulai'],
      },
    },
  },
];

/**
 * Mengirim riwayat percakapan ke GPT-4o-mini.
 *
 * @param {Array<{role: string, content: string}>} messages - Riwayat chat dari memory.js
 * @returns {Promise<{type: 'message', content: string} | {type: 'tool_call', args: Object}>}
 */
export async function chat(messages) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ],
    tools: TOOLS,
    tool_choice: 'auto',
  });

  const choice = response.choices[0];

  // Tool call → data lengkap, waktu simpan ke sheet
  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length > 0) {
    const toolCall = choice.message.tool_calls[0];
    const args = JSON.parse(toolCall.function.arguments);
    return { type: 'tool_call', args };
  }

  // Balasan percakapan biasa
  const content = choice.message.content?.trim() || '';
  return { type: 'message', content };
}
