const SENSITIVE_FIELDS = ["password", "adminKey", "token", "authorization"];

export function sanitizeLog(data) {
  if (typeof data !== "object" || data === null) {
    return data;
  }

  const sanitized = { ...data };

  for (const field of SENSITIVE_FIELDS) {
    if (field in sanitized) {
      sanitized[field] = "[REDACTED]";
    }
  }

  return sanitized;
}

export function safeLog(message, data) {
  console.log(message, sanitizeLog(data));
}
