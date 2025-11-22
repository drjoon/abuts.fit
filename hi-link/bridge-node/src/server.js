import express from "express";
import cors from "cors";
import cncRoutes from "./routes/cncRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/cnc", cncRoutes);

const port = process.env.PORT || 4005;
app.listen(port, () => {
  console.log(`hi-link bridge-node listening on port ${port}`);
});
