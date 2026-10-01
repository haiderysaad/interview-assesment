import "dotenv/config";
for (const k of ["DATABASE_URL", "DIRECT_URL"]) {
  const u = new URL(process.env[k]);
  console.log(k, "| user:", u.username, "| host:", u.hostname, "| port:", u.port, "| password length:", decodeURIComponent(u.password).length);
}