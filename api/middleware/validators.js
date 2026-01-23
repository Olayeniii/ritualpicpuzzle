import { body, validationResult } from "express-validator";

export const validateScoreSubmission = [
  body("username")
    .trim()
    .isLength({ min: 3, max: 20 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage("Username must be 3-20 alphanumeric characters"),
  body("moves")
    .isInt({ min: 0, max: 10000 })
    .withMessage("Moves must be between 0 and 10000"),
  body("time")
    .isInt({ min: 0, max: 300 })
    .withMessage("Time must be between 0 and 300 seconds"),
  body("timeout").optional().isBoolean(),
];

export function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}
