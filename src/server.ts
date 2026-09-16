import "dotenv/config";
import express from "express";
// import wordpressRoutes from "./routes/wordpress.routes.js";
import insightsRoutes from "./routes/insights.routes.js";

const app = express();

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

// app.use("/api/wordpress", wordpressRoutes);
app.use("/api/insights", insightsRoutes);

const PORT = process.env.PORT || 3000;


const options: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

const localTime = new Date().toLocaleString("en-IN", options);





app.listen(PORT, () => {
  console.log(`Insight Agent running on port ${PORT}`);
  console.log(`${localTime.replace(/,/g, '')} Server started successfully.`);
});