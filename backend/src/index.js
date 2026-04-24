require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cron = require("node-cron");
const logger = require("./utils/logger");
const db = require("./database");

const productsRouter = require("./routes/products");
const amazonRouter = require("./routes/amazon");
const mercadolibreRouter = require("./routes/mercadolibre");
const syncRouter = require("./routes/sync");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const paymentsRouter = require("./routes/payments");
const configRouter = require("./routes/config");
const csvRouter = require("./routes/csv");
const questionsRouter = require("./routes/questions");
const competitionRouter = require("./routes/competition");
const ordersRouter = require("./routes/orders");
const alertsRouter = require("./routes/alerts");
const reportsRouter = require("./routes/reports");
const mlAccountsRouter = require("./routes/mlaccounts");
const catalogRouter = require("./routes/catalog");
const { requireAuth } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: ["http://localhost:3000", "http://localhost:5173", "http://localhost:5175", "https://amazon-ml-sync-frontend.vercel.app"] }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api/", rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

app.use((req, res, next) => { logger.info(req.method + " " + req.path); next(); });

db.initialize();

// Cargar tokens ML desde DB al arrancar
(async () => {
  try {
    const accessToken = await db.getConfig('ml_access_token');
    const refreshToken = await db.getConfig('ml_refresh_token');
    if (accessToken && !accessToken.startsWith('APP_USR-XXXXX')) {
      process.env.ML_ACCESS_TOKEN = accessToken;
      logger.info('ML_ACCESS_TOKEN cargado desde DB');
    }
    if (refreshToken && !refreshToken.startsWith('TG-XXX')) {
      process.env.ML_REFRESH_TOKEN = refreshToken;
      logger.info('ML_REFRESH_TOKEN cargado desde DB');
    }
  } catch (e) {
    logger.warn('No se pudieron cargar tokens ML desde DB:', e.message);
  }
})();

// Rutas públicas (no requieren JWT)
app.use("/api/auth", authRouter);
app.use("/api/auth", usersRouter);
app.use("/api/payments/webhook", paymentsRouter);

// Rutas protegidas con JWT
app.use("/api/payments", requireAuth, paymentsRouter);
app.use("/api/products", requireAuth, productsRouter);
app.use("/api/amazon", requireAuth, amazonRouter);
app.use("/api/mercadolibre", requireAuth, mercadolibreRouter);
app.use("/api/sync", requireAuth, syncRouter);
app.use("/api/config", requireAuth, configRouter);
app.use("/api/csv", requireAuth, csvRouter);
app.use("/api/questions", requireAuth, questionsRouter);
app.use("/api/competition", requireAuth, competitionRouter);
app.use("/api/orders", requireAuth, ordersRouter);
app.use("/api/alerts", requireAuth, alertsRouter);
app.use("/api/reports", requireAuth, reportsRouter);
app.use("/api/ml-accounts", requireAuth, mlAccountsRouter);
app.use("/api/catalog", requireAuth, catalogRouter);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "2.0.0", timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || "Error interno del servidor" });
});

const cronExpression = process.env.SYNC_CRON || "0 * * * *";
cron.schedule(cronExpression, async () => {
  logger.info("Iniciando sync automatica...");
});

// Check stock alerts every 6 hours
cron.schedule("0 */6 * * *", async () => {
  try {
    const alertsRoute = require("./routes/alerts");
    logger.info("Verificando stock automáticamente...");
  } catch (e) { logger.error("Error en cron stock check:", e.message); }
});

app.listen(PORT, async () => {
  logger.info("Servidor corriendo en http://localhost:" + PORT);

  if (process.env.USE_TUNNEL === 'true') {
    try {
      const localtunnel = require('localtunnel');
      const tunnel = await localtunnel({ port: parseInt(PORT), subdomain: 'amazonmlsync2024' });
      process.env.TUNNEL_URL = tunnel.url;
      logger.info('==============================================');
      logger.info('TUNNEL URL (usa esta como redirect_uri en ML):');
      logger.info(tunnel.url + '/api/auth/callback');
      logger.info('==============================================');
      tunnel.on('error', (err) => logger.error('Tunnel error:', err.message));
      tunnel.on('close', () => logger.warn('Tunnel cerrado'));
    } catch (err) {
      logger.error('No se pudo iniciar localtunnel:', err.message);
    }
  }
});

module.exports = app;
