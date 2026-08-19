import { Router } from "express";
import authRoute from "./modules/auth/auth.route";
import destinationRoute from "./modules/destination/destination.route";
import placeRoute from "./modules/place/place.route";
import userRoute from "./modules/user/user.route";

const router = Router();

router.use("/auth", authRoute);
router.use("/users", userRoute);
router.use("/destinations", destinationRoute);
router.use("/places", placeRoute);

export default router;
