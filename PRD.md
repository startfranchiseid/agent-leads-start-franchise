Product Requirements Document (PRD)

Project Name: WhatsApp AI Lead Qualification (Redis Gatekeeper + Render PaaS)
Version: 6.0 (No-Credit-Card Blueprint)
Target Platform: Render (Free Web Service) + UptimeRobot (Keep-Alive)
Core Technologies: Node.js, express, @whiskeysockets/baileys, OpenAI (gpt-4o-mini), Upstash Redis, Google Sheets API.

1. Executive Summary

Sistem ini adalah asisten kualifikasi leads WhatsApp yang 100% gratis, di-hosting di Render (tanpa syarat kartu kredit), dan dioptimalkan untuk performa tinggi menggunakan Redis. Bot didesain eksklusif: Hanya merespons nomor yang benar-benar baru.

Sistem akan otomatis memetakan daftar kontak/chat historis WhatsApp saat pertama kali login dan menyimpannya di Redis sebagai blacklist. Saat nomor baru terdeteksi, bot menuntun leads untuk mengisi data spesifik seputar ketertarikan franchise (Sumber Info, Bidang Usaha, Biodata, Budget, Rencana Mulai) melalui obrolan natural, mencatatnya ke Google Sheets, mengucapkan terima kasih, lalu memasukkan nomor tersebut ke Redis agar tidak direspons lagi selamanya.

2. Arsitektur Sistem & Tech Stack

2.1. Pendekatan "Hybrid Monolith" dengan Keep-Alive

Aplikasi berjalan sebagai 1 service Node.js di Render. Karena tier gratis Render akan "tertidur" setelah 15 menit tidak ada request, kita menambahkan Express.js sebagai dummy web server.

WA Engine: @whiskeysockets/baileys (Koneksi WebSocket native, hemat RAM).

Keep-Alive Server: express (Menyediakan endpoint HTTP sederhana misal /ping).

Pinger Eksternal: UptimeRobot (Layanan gratis untuk menembak endpoint /ping setiap 14 menit agar server Render tidak pernah tidur).

Speed Gatekeeper: Upstash Redis (Pengecekan O(1) latensi < 50ms via REST API).

Brain & Storage: OpenAI API (Kecerdasan) & Google Sheets API (Penyimpanan Data).

2.2. Diagram Alur Data (Data Flow)

Fase 1: Inisialisasi & Sinkronisasi (Hanya saat Login/Start)

Node.js berjalan, mengaktifkan server Express (di port 3000/PORT Render), dan terhubung ke WhatsApp.

Baileys menangkap event sinkronisasi riwayat chat.

Node.js mengekstrak semua nomor telepon (JID) historis.

Node.js menyimpan kumpulan nomor tersebut ke Upstash Redis dalam SET bernama known_contacts.

Fase 2: Alur Chat (Pesan Masuk)

User (WA) mengirim pesan.

Node.js menerima pesan dan mengekstrak nomor pengirim.

Gatekeeper (Redis): Cek SISMEMBER known_contacts <nomor>.

Jika 1 (Ada): Bot diam (mengabaikan pesan).

Jika 0 (Tidak Ada): Lanjut ke tahap 4.

Conversation Mode:

Node.js mengambil riwayat obrolan sementara dari memori lokal (Array/Map).

Node.js mengirim riwayat tersebut ke gpt-4o-mini.

AI membalas dengan pertanyaan lanjutan (sesuai System Prompt).

Eksekusi Penyimpanan (Tool Calling):

Saat data lengkap, AI memicu tool save_lead_to_sheet.

Node.js memanggil Google Sheets API untuk Append Row.

Finalisasi:

Node.js mengirim balasan final (Terima kasih).

Node.js mendaftarkan nomor ke Redis (SADD known_contacts <nomor>).

Memori obrolan sementara si lead dihapus.

3. Struktur Database

3.1. Upstash Redis

Tipe Data: SET

Key: known_contacts

Value: String nomor telepon format internasional tanpa '+' (Contoh: 628123456789)

3.2. Google Sheets

Sheet Name: Leads (atau Sheet1)

Kolom:

A: Timestamp (Waktu pesan masuk)

B: Nomor WA (ID Pengirim)

C: Sumber Info (Dari AI, misal: TikTok, Instagram)

D: Bidang Usaha (Dari AI, misal: Makanan/Minuman, Laundry)

E: Biodata (Dari AI, berisi Nama & Domisili)

F: Budget (Dari AI, misal: 15jt kebawah, under 50jt)

G: Rencana Mulai (Dari AI, misal: secepatnya, bulan Mei)

4. Spesifikasi Prompt & AI Tools

4.1. System Prompt

Anda adalah Asisten Virtual yang ramah dan profesional untuk layanan kemitraan/franchise.
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
- Jika pengguna sudah memberikan kelima informasi di atas, JANGAN membalas dengan teks tanya jawab lagi. LANGSUNG panggil fungsi 'save_lead_to_sheet' dengan data yang telah dikumpulkan.


4.2. Tool Schema (JSON)

{
  "name": "save_lead_to_sheet",
  "description": "Menyimpan data kualifikasi lead franchise ke database jika semua 5 informasi sudah terkumpul.",
  "parameters": {
    "type": "object",
    "properties": {
      "sumber_info": { "type": "string", "description": "Sumber informasi darimana mengetahui franchise (Contoh: TikTok, Instagram)" },
      "bidang_usaha": { "type": "string", "description": "Bidang usaha atau brand franchise yang diminati (Contoh: FnB, Laundry, Kopi Fore, Maxim)" },
      "biodata": { "type": "string", "description": "Nama dan domisili kota asal pengguna (Contoh: Syifa, Rancaekek Kab Bandung)" },
      "budget": { "type": "string", "description": "Anggaran yang disiapkan (Contoh: 15jt kebawah, under 50jt, 10 s.d 30 jt)" },
      "rencana_mulai": { "type": "string", "description": "Waktu mulai usaha yang direncanakan (Contoh: secepatnya, maret, masih difikirkan)" }
    },
    "required": ["sumber_info", "bidang_usaha", "biodata", "budget", "rencana_mulai"]
  }
}


5. Struktur Direktori Proyek

wa-ai-lead-bot/
├── .env                  # Environment variables
├── package.json          # Dependency list (wajib ada express)
├── server.js             # Entry point (Inisialisasi Express & panggil bot)
├── src/
│   ├── bot.js            # Logic inisialisasi Baileys
│   ├── config.js         # Setup ENV & validasi
│   ├── redis.js          # Logic untuk get/set Upstash Redis
│   ├── sheets.js         # Logic Google Sheets API (Append row)
│   ├── openai.js         # Logic call GPT-4o-mini & Tool handling
│   └── memory.js         # In-memory session manager (Map)
└── auth_info_baileys/    # Folder otomatis buatan Baileys untuk simpan sesi login


6. Skenario Percakapan (Contoh)

Lead: "Halo kak, mau tanya soal kemitraan"

Bot: "Halo kak! Salam kenal, dengan senang hati kami akan bantu. Sebelumnya, boleh tahu kakak tahu info kemitraan kami dari mana nih? Dan tertarik di bidang usaha apa? 😊"

Lead: "Dari vt tiktok kak, tertarik buka Laundry"

Bot: "Wah, mantap kak dari TikTok! Oiya, agar kami bisa kasih rekomendasi yang pas, boleh tahu nama kakak dan domisilinya di mana? 🏢"

Lead: "Aku Valen, dari Surabaya"

Bot: "Salam kenal kak Valen di Surabaya! Untuk kemitraan Laundry ini, kira-kira budget yang kakak siapkan di range berapa nih kak? Dan rencananya mau mulai kapan? 💼"

Lead: "Budget under 50jt sih kak, kalau bisa bulan maret udah jalan"

(Di balik layar: AI mendeteksi data lengkap. AI memanggil fungsi save_lead_to_sheet -> Node.js simpan ke Google Sheets -> Node.js tambah nomor ke Redis).

Bot: "Noted kak Valen! Data kebutuhan kakak untuk buka franchise Laundry di Surabaya bulan Maret dengan budget under 50jt sudah kami catat ya. Tim konsultan kami akan segera menghubungi kakak secepatnya untuk detail paketnya. Terima kasih banyak kak! 🙏"

Lead: "Oke terima kasih"

(Di balik layar: Pesan ini diabaikan karena nomor sudah masuk di daftar Redis).

7. Variabel Lingkungan (ENV) & Setup Render

WA_PHONE_NUMBER: Nomor bot (Contoh: 628123456789 - untuk Pairing Code).

OPENAI_API_KEY: Kunci API OpenAI Anda.

UPSTASH_REDIS_REST_URL: URL dari Upstash.

UPSTASH_REDIS_REST_TOKEN: Token akses Upstash.

GOOGLE_SERVICE_ACCOUNT_EMAIL: Email service account GCP.

GOOGLE_PRIVATE_KEY: Private key GCP (Harus string valid dengan \n).

GOOGLE_SHEET_ID: ID dokumen Spreadsheet target.

Instruksi Keep-Alive (Penting untuk Render):

Setelah aplikasi di-deploy di Render sebagai "Web Service", Render akan memberikan URL (contoh: https://wa-bot-app.onrender.com).

Buka situs gratis UptimeRobot.

Buat monitor baru bertipe HTTP(s), masukkan URL Render Anda.

Set interval pengecekan setiap 14 menit.

Server web Express di dalam kode akan merespons ping ini, mencegah Render "tertidur", sehingga bot WA akan aktif 24/7.