import { Router } from "express";
import authRoute from "./modules/auth/auth.route";
import destinationRoute from "./modules/destination/destination.route";
import expenseRoute from "./modules/expense/expense.route";
import itineraryRoute from "./modules/itinerary/itinerary.route";
import placeRoute from "./modules/place/place.route";
import tripRoute from "./modules/trip/trip.route";
import userRoute from "./modules/user/user.route";

const router = Router();

router.use("/auth", authRoute);
router.use("/users", userRoute);
router.use("/destinations", destinationRoute);
router.use("/places", placeRoute);

// Before the trip router: that one owns "/trips" and would answer 404 for a
// nested path it does not define.
router.use("/trips/:tripId/days", itineraryRoute);
router.use("/trips/:tripId/expenses", expenseRoute);
router.use("/trips", tripRoute);

export default router;
