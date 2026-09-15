import express from "express";
import wordpressRoutes from "./routes/wordpress.routes.js";

const app = express();

app.use(express.json());

app.use("/api/wordpress", wordpressRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Insight Agent running on port ${PORT}`);
});