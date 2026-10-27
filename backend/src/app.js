import express from "express";
import cors from "cors";
import "./db.js";
import router from "./routes.js";
import { errorHandler } from "./errors.js";

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "32kb" }));
app.use("/api", router);

app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested endpoint does not exist.",
    },
  });
});

app.use(errorHandler);

export { app };
export default app;
