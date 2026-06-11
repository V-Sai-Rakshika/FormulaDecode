const fs = require("fs");

const supabaseUrl =
  process.env.SUPABASE_URL || "https://wixascniconmucxqavdf.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const groqApiKey = process.env.GROQ_API_KEY || "";

fs.writeFileSync(
  "config.js",
  `const FD_CONFIG = {
  supabaseUrl: "${supabaseUrl}",
  supabaseAnonKey: "${supabaseAnonKey}",
  groqApiKey: "${groqApiKey}"
};`,
);

console.log("Config generated:", supabaseUrl ? "✓ URL set" : "✗ URL missing");
