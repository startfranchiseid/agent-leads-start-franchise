/**
 * memory.js
 * In-memory session manager menggunakan Map.
 * Menyimpan riwayat percakapan sementara per JID (nomor WhatsApp).
 *
 * Format message: { role: 'user'|'assistant', content: string }
 */

/** @type {Map<string, Array<{role: string, content: string}>>} */
const sessions = new Map();

/**
 * Mengambil riwayat percakapan untuk JID tertentu.
 * @param {string} jid
 * @returns {Array<{role: string, content: string}>}
 */
export function getSession(jid) {
  if (!sessions.has(jid)) {
    sessions.set(jid, []);
  }
  return sessions.get(jid);
}

/**
 * Menambahkan pesan ke riwayat percakapan JID.
 * @param {string} jid
 * @param {'user'|'assistant'} role
 * @param {string} content
 */
export function addMessage(jid, role, content) {
  const session = getSession(jid);
  session.push({ role, content });
}

/**
 * Menghapus seluruh riwayat percakapan JID (setelah data tersimpan).
 * @param {string} jid
 */
export function clearSession(jid) {
  sessions.delete(jid);
}
