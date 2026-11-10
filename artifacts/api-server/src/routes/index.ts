import { Router, type IRouter } from "express";
import healthRouter from "./health";
import complaintsRouter from "./complaints";

const router: IRouter = Router();

router.use(healthRouter);
router.use(complaintsRouter);

export default router;
