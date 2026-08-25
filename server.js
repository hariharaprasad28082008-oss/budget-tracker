const express = require("express"), mysql = require("mysql2"), cors = require("cors"), bcrypt = require("bcrypt"), session = require("express-session"), path = require("path");
require("dotenv").config();
const app = express();
app.enable("trust proxy");
app.use(cors({ origin: true, credentials: true }), express.json(), express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || "fallback-production-encryption-secret-string-key",
    resave: true, saveUninitialized: false, cookie: { secure: false, httpOnly: true, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public"), { index: false }));
const db = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: process.env.DB_PORT || 3306,
    waitForConnections: true, connectionLimit: 10, queueLimit: 0, ssl: process.env.DB_HOST && process.env.DB_HOST !== "localhost" ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : null
});
db.getConnection((err, connection) => { if (err) { console.error("MySQL connection failed:", err.message); } else { console.log("MySQL connected successfully"); connection.release(); } });
function requireLogin(req, res, next) { if (!req.session || !req.session.userId) { return res.status(401).json({ error: "Please login first" }); } next(); }

app.post("/api/signup", async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) { return res.status(400).json({ error: "Please fill all fields" }); }
    if (password.length < 6) { return res.status(400).json({ error: "Password must be at least 6 characters" }); }
    db.query("SELECT id FROM users WHERE email = ?", [email], async (err, results) => {
        if (err) { console.error(err); return res.status(500).json({ error: "Database error" }); }
        if (results && results.length > 0) { return res.status(400).json({ error: "Email already registered" }); }
        const hashedPassword = await bcrypt.hash(password, 10);
        db.query("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [name, email, hashedPassword], (err, result) => {
            if (err) { console.error(err); return res.status(500).json({ error: "Failed to create account" }); }
            res.json({ message: "Account created successfully", userId: result.insertId });
        });
    });
});

app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) { return res.status(400).json({ error: "Please enter email and password" }); }
    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
        if (err) { console.error(err); return res.status(500).json({ error: "Database error" }); }
        if (!results || results.length === 0) { return res.status(401).json({ error: "Invalid email or password" }); }
        const user = results[0]; // FIXED: Proper array indexing for pool rows extraction layout
        if (!user || !user.password || !(await bcrypt.compare(password, user.password))) { return res.status(401).json({ error: "Invalid email or password" }); }
        req.session.userId = user.id; req.session.userName = user.name; req.session.userEmail = user.email;
        req.session.save((err) => { if (err) { return res.status(500).json({ error: "Session failed" }); } res.json({ message: "Login successful", user: { id: user.id, name: user.name, email: user.email } }); });
    });
});

app.post("/api/logout", (req, res) => { req.session.destroy((err) => { res.clearCookie("connect.sid", { path: "/" }); res.json({ message: "Logged out successfully" }); }); });
app.get("/api/me", (req, res) => { if (!req.session || !req.session.userId) { return res.status(401).json({ loggedIn: false }); } res.json({ loggedIn: true, user: { id: req.session.userId, name: req.session.userName, email: req.session.userEmail } }); });

app.get("/api/transactions", requireLogin, (req, res) => {
    db.query("SELECT id, type, category, description, amount, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC, id DESC", [req.session.userId], (err, results) => {
        if (err) { return res.status(500).json({ error: "Failed to fetch transactions" }); } res.json(results);
    });
});

app.post("/api/transactions", requireLogin, (req, res) => {
    const { type, category, description, amount, transaction_date } = req.body;
    if (!type || !category || !amount || !transaction_date) { return res.status(400).json({ error: "Please fill all required fields" }); }
    db.query("INSERT INTO transactions (user_id, type, category, description, amount, transaction_date) VALUES (?, ?, ?, ?, ?, ?)", [req.session.userId, type, category, description || "", amount, transaction_date], (err, result) => {
        if (err) { return res.status(500).json({ error: "Failed to add transaction" }); } res.json({ message: "Transaction added successfully", id: result.insertId });
    });
});

app.delete("/api/transactions/:id", requireLogin, (req, res) => {
    db.query("DELETE FROM transactions WHERE id = ? AND user_id = ?", [req.params.id, req.session.userId], (err, result) => {
        if (err) { return res.status(500).json({ error: "Failed to delete transaction" }); } res.json({ message: "Transaction deleted successfully" });
    });
});

app.put("/api/transactions/:id", requireLogin, (req, res) => {
    const { type, category, description, amount, transaction_date } = req.body;
    db.query("UPDATE transactions SET type = ?, category = ?, description = ?, amount = ?, transaction_date = ? WHERE id = ? AND user_id = ?", [type, category, description || "", amount, transaction_date, req.params.id, req.session.userId], (err, result) => {
        if (err) { return res.status(500).json({ error: "Failed to update transaction" }); } res.json({ message: "Transaction updated successfully" });
    });
});

app.get("/api/summary", requireLogin, (req, res) => {
    db.query("SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS totalIncome, COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS totalExpense FROM transactions WHERE user_id = ?", [req.session.userId], (err, results) => {
        if (err) { return res.status(500).json({ error: "Failed to calculate summary" }); }
        const row = results[0] || {}; const totalIncome = Number(row.totalIncome || 0), totalExpense = Number(row.totalExpense || 0);
        res.json({ totalIncome, totalExpense, balance: totalIncome - totalExpense });
    });
});

app.get("/api/expense-chart", requireLogin, (req, res) => {
    db.query("SELECT category, SUM(amount) AS total FROM transactions WHERE user_id = ? AND type = 'expense' GROUP BY category ORDER BY total DESC", [req.session.userId], (err, results) => {
        if (err) { return res.status(500).json({ error: "Failed to load expense chart" }); } res.json(results);
    });
});

app.get("/", (req, res) => { if (req.session && req.session.userId) { return res.sendFile(path.join(__dirname, "public", "index.html")); } res.sendFile(path.join(__dirname, "public", "login.html")); });
app.get("/login", (req, res) => { res.sendFile(path.join(__dirname, "public", "login.html")); });
app.get("/signup", (req, res) => { res.sendFile(path.join(__dirname, "public", "signup.html")); });
app.get("/*path", (req, res) => { if (req.session && req.session.userId) { return res.sendFile(path.join(__dirname, "public", "index.html")); } res.sendFile(path.join(__dirname, "public", "login.html")); });

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
