import bcrypt from "bcryptjs";
import crypto from "crypto";

const password = "your-secure-password-here";
const hash = await bcrypt.hash(password, 12);
const jwtSecret = crypto.randomBytes(64).toString("hex");

console.log("Add to .env:");
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`CSRF_SECRET=${crypto.randomBytes(32).toString("hex")}`);
