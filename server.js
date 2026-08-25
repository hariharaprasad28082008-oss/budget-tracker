const express = require("express"), mysql = require("mysql2"), cors = require("cors"), bcrypt = require("bcrypt"), session = require("express-session"), path = require("path");
require("dotenv").config();

const app = express();
app.use(cors({ origin: true, credentials: true }), express.json(), express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || "fallback-secret-key", resave: false, saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public"), { index: false }));

const db = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306, waitForConnections: true, connectionLimit: 10, queueLimit: 0,
    ssl: process.env.DB_HOST && process.env.DB_HOST !== "localhost" ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : null
});
db.getConnection((err, conn) => err ? console.error("DB failed:", err.message) : (console.log("MySQL connected"), conn.release()));

const requireLogin = (req, res, next) => req.session.userId ? next() : res.status(401).json({ error: "Please login first" });

app.post("/api/signup", async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "Please fill all fields" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    db.query("SELECT id FROM users WHERE email = ?", [email], async (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (results.length > 0) return res.status(400).json({ error: "Email already registered" });

        const hashed = await bcrypt.hash(password, 10);
        db.query("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [name, email, hashed], (err, result) => {
            if (err) return res.status(500).json({ error: "Failed to create account" });
            res.json({ message: "Account created successfully", userId: result.insertId });
        });
    });
});

app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Please enter email and password" });

    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!results || results.length === 0) return res.status(401).json({ error: "Invalid email or password" });

        const user = results[0];
        if (!(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: "Invalid email or password" });

        req.session.userId = user.id; req.session.userName = user.name; req.session.userEmail = user.email;
        res.json({ message: "Login successful", user: { id: user.id, name: user.name, email: user.email } });
    });
});

app.post("/api/logout", (req, res) => req.session.destroy(() => { res.clearCookie("connect.sid"); res.json({ message: "Logged out" }); }));

app.get("/api/me", (req, res) => req.session.userId ? res.json({ loggedIn: true, user: { id: req.session.userId, name: req.session.userName, email: req.session.userEmail } }) : res.status(401).json({ loggedIn: false }));

app.get("/api/transactions", requireLogin, (req, res) => {
    db.query("SELECT id, type, category, description, amount, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC, id DESC", [req.session.userId], (err, results) => {
        if (err) return res.status(500).json({ error: "Failed to fetch transactions" });
        res.json(results);
    });
});

app.post("/api/transactions", requireLogin, (req, res) => {
    const { type, category, description, amount, transaction_date } = req.body;
    if (!type || !category || !amount || !transaction_date) return res.status(400).json({ error: "Missing required fields" });
    if (type !== "income" && type !== "expense") return res.status(400).json({ error: "Invalid type" });

    db.query("INSERT INTO transactions (user_id, type, category, description, amount, transaction_date) VALUES (?, ?, ?, ?, ?, ?)", [req.session.userId, type, category, description || "", amount, transaction_date], (err, result) => {
        if (err) return res.status(500).json({ error: "Failed to add transaction" });
        res.json({ message: "Transaction added successfully", id: result.insertId });
    });
});

app.delete("/api/transactions/:id", requireLogin, (req, res) => {
    db.query("DELETE FROM transactions WHERE id = ? AND user_id = ?", [req.params.id, req.session.userId], (err, result) => {
        if (err) return res.status(500).json({ error: "Failed to delete" });
        res.json(result.affectedRows ? { message: "Deleted successfully" } : res.status(404).json({ error: "Not found" }));
    });
});

app.put("/api/transactions/:id", requireLogin, (req, res) => {
    const { type, category, description, amount, transaction_date } = req.body;
    db.query("UPDATE transactions SET type = ?, category = ?, description = ?, amount = ?, transaction_date = ? WHERE id = ? AND user_id = ?", [type, category, description || "", amount, transaction_date, req.params.id, req.session.userId], (err, result) => {
        if (err) return res.status(500).json({ error: "Failed to update" });
        res.json(result.affectedRows ? { message: "Updated successfully" } : res.status(404).json({ error: "Not found" }));
    });
});

app.get("/api/summary", requireLogin, (req, res) => {
    db.query("SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS totalIncome, COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS totalExpense FROM transactions WHERE user_id = ?", [req.session.userId], (err, results) => {
        if (err) return res.status(500).json({ error: "Summary calculation failed" });
        const inc = Number(results[0].totalIncome), exp = Number(results[0].totalExpense);
        res.json({ totalIncome: inc, totalExpense: exp, balance: inc - exp });
    });
});

app.get("/api/expense-chart", requireLogin, (req, res) => {
    db.query("SELECT category, SUM(amount) AS total FROM transactions WHERE user_id = ? AND type = 'expense' GROUP BY category ORDER BY total DESC", [req.session.userId], (err, results) => {
        if (err) return res.status(500).json({ error: "Chart loading failed" });
        res.json(results);
    });
});

const sendFile = (file) => (req, res) => res.sendFile(path.join(__dirname, "public", file));
const serveIndexOrLogin = (req, res) => req.session.userId ? res.sendFile(path.join(__dirname, "public", "index.html")) : res.sendFile(path.join(__dirname, "public", "login.html"));

app.get("/", serveIndexOrLogin);
app.get("/login", sendFile("login.html"));
app.get("/signup", sendFile("signup.html"));
app.get("/*path", serveIndexOrLogin);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server live on ${PORT}`));
