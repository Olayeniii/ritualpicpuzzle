import { Tokens } from "csrf";

const tokens = new Tokens();
const secret = process.env.CSRF_SECRET || tokens.secretSync();

export function generateCsrfToken() {
  return tokens.create(secret);
}

export function verifyCsrfToken(token) {
  return tokens.verify(secret, token);
}

export function csrfProtection(req, res, next) {
  if (req.method === "GET") {
    return next();
  }

  const token = req.headers["x-csrf-token"];
  if (!token || !verifyCsrfToken(token)) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  next();
}
