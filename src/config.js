import 'dotenv/config';

const required = [
  'WA_PHONE_NUMBER',
  'OPENAI_API_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'GOOGLE_SHEET_ID',
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ ENV missing: ${key}`);
    process.exit(1);
  }
}

export const config = {
  waPhoneNumber: process.env.WA_PHONE_NUMBER,
  openaiApiKey: process.env.OPENAI_API_KEY,
  upstashRedisUrl: process.env.UPSTASH_REDIS_REST_URL,
  upstashRedisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  // Ganti literal \n dengan newline asli jika ENV diisi sebagai single-line string
  googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  googleSheetId: process.env.GOOGLE_SHEET_ID,
};
