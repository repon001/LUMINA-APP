import { Router } from "express";
import authRoute from "./modules/auth/auth.route";
import userRoute from "./modules/user/user.route";

const router = Router();

router.use("/auth", authRoute);
router.use("/users", userRoute);

export default router;
