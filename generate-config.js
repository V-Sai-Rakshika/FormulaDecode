const fs = require("fs");

const supabaseUrl =
  process.env.SUPABASE_URL || "https://wixascniconmucxqavdf.supabase.co";
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_OXEiDGQLGlNsLTi4ijRcYw_ZfjmLlBv";
const groqApiKey = process.env.GROQ_API_KEY || "";

fs.writeFileSync(
  "config.js",
  `const FD_CONFIG = {
  supabaseUrl: "${supabaseUrl}",
  supabaseAnonKey: "${supabaseAnonKey}",
  groqApiKey: "${groqApiKey}"
};`,
);

console.log("Config generated ✓");
console.log("supabaseUrl:", supabaseUrl ? "✓ set" : "✗ missing");
console.log("supabaseAnonKey:", supabaseAnonKey ? "✓ set" : "✗ missing");
console.log("groqApiKey:", groqApiKey ? "✓ set" : "✗ missing");
