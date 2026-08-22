// Vercel compatibility module for mcp-js's optional Cloudflare environment import.
// On Vercel, server-side variables are exposed through process.env.
export const env = process.env;