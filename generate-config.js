const fs = require("fs");
fs.writeFileSync(
  "config.js",
  `const FD_CONFIG = {
  supabaseUrl: "${process.env.SUPABASE_URL}",
  supabaseAnonKey: "${process.env.SUPABASE_ANON_KEY}",
  groqApiKey: "${process.env.GROQ_API_KEY}"
};`,
);
