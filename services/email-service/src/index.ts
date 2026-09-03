import express from "express";

const app = express();
const serviceName = process.env.SERVICE_NAME ?? "email-service";
const port = Number(process.env.PORT ?? 8085);

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: serviceName });
});

app.listen(port, () => {
  console.log(`[${serviceName}] listening on port ${port}`);
});
