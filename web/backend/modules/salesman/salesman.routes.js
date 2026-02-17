import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { getSalesmanDashboard } from "../controllers/salesman.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize(["salesman"]));

router.get("/dashboard", getSalesmanDashboard);

export default router;
