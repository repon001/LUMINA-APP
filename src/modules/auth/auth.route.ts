import { Router } from "express";
import { AuthController } from "./auth.controller";
import { authenticate } from "../../middleware/auth";
import { authLimiter } from "../../middleware/rate-limit";
import { validate } from "../../middleware/validate";
import { loginSchema, registerSchema } from "./auth.validation";

const router = Router();

// The three routes that accept a credential are the ones worth brute-forcing,
// so they get a tighter budget than the rest of the API.
router.post("/register", authLimiter, validate({ body: registerSchema }), AuthController.register);
router.post("/login", authLimiter, validate({ body: loginSchema }), AuthController.login);
router.post("/refresh", authLimiter, AuthController.refresh);
router.post("/logout", AuthController.logout);
router.get("/me", authenticate, AuthController.me);

export default router;
