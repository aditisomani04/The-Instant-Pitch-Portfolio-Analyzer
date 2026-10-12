import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pitchRouter from "./pitch";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pitchRouter);

export default router;
