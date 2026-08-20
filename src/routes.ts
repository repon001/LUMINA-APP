import { Router } from "express";
import aiRoute from "./modules/ai/ai.route";
import authRoute from "./modules/auth/auth.route";
import destinationRoute from "./modules/destination/destination.route";
import expenseRoute from "./modules/expense/expense.route";
import itineraryRoute from "./modules/itinerary/itinerary.route";
import moderationRoute from "./modules/moderation/moderation.route";
import paymentRoute from "./modules/payment/payment.route";
import placeRoute from "./modules/place/place.route";
import tripRoute from "./modules/trip/trip.route";
import userRoute from "./modules/user/user.route";

const router = Router();

router.use("/auth", authRoute);
router.use("/ai", aiRoute);
router.use("/users", userRoute);
router.use("/moderation", moderationRoute);
router.use("/destinations", destinationRoute);
router.use("/places", placeRoute);
router.use("/payments", paymentRoute);

// Before the trip router: that one owns "/trips" and would answer 404 for a
// nested path it does not define.
router.use("/trips/:tripId/days", itineraryRoute);
router.use("/trips/:tripId/expenses", expenseRoute);
router.use("/trips", tripRoute);

export default router;
