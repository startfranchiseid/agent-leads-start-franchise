/**
 * sheets.js
 * Wrapper Google Sheets API untuk menyimpan data leads ke spreadsheet.
 * Menggunakan Google Service Account untuk autentikasi.
 */

import { google } from 'googleapis';
import { config } from './config.js';

const SHEET_NAME = 'Leads';

// Inisialisasi Google Auth sekali saja
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: config.googleServiceAccountEmail,
    private_key: config.googlePrivateKey,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

/**
 * Menambahkan baris data lead ke Google Sheet.
 *
 * @param {Object} lead
 * @param {string} lead.timestamp     - Waktu pesan pertama masuk
 * @param {string} lead.nomor         - Nomor WhatsApp pengirim
 * @param {string} lead.sumber_info   - Sumber informasi (TikTok, Instagram, dll)
 * @param {string} lead.bidang_usaha  - Bidang usaha / brand (Laundry, FnB, dll)
 * @param {string} lead.biodata       - Nama & domisili
 * @param {string} lead.budget        - Budget yang disiapkan
 * @param {string} lead.rencana_mulai - Rencana waktu mulai usaha
 * @returns {Promise<void>}
 */
export async function appendLead(lead) {
  const values = [
    [
      lead.timestamp,
      lead.nomor,
      lead.sumber_info,
      lead.bidang_usaha,
      lead.biodata,
      lead.budget,
      lead.rencana_mulai,
    ],
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${SHEET_NAME}!A:G`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  console.log(`✅ Google Sheets: Lead dari ${lead.nomor} berhasil disimpan.`);
}
