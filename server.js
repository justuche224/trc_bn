const express = require("express");
const cors = require("cors");
const path = require("path");
const adminRoutes = require("./routes/admin.js");
// Import public routes (note: this uses dynamic import since it's an ES module)
let publicRoutes;
import("./routes/public.mjs").then((module) => {
  publicRoutes = module.default;
});

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname)));

// Routes
app.use("/api/admin", adminRoutes);
// Add public routes once they're loaded
app.use("/api/public", (req, res, next) => {
  if (publicRoutes) {
    return publicRoutes(req, res, next);
  } else {
    return res.status(500).json({ message: "Public routes not initialized" });
  }
});

// Serve the test.html file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "test.html"));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
