const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");

require("dotenv").config();

const app = express();


// =========================
// MIDDLEWARE
// =========================

app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));

app.use(session({
    secret: process.env.SESSION_SECRET || "fallback-secret-key",
    resave: false,
    saveUninitialized: false,

    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));


// =========================
// STATIC FILES EXCLUSION
// =========================

// Serves asset styles/images natively but shields raw root landing overrides
app.use(express.static(path.join(__dirname, "public"), { index: false }));


// =========================
// MYSQL CONNECTION
// =========================

const db = mysql.createPool({

    host: process.env.DB_HOST,

    user: process.env.DB_USER,

    password: process.env.DB_PASSWORD,

    database: process.env.DB_NAME,

    port: process.env.DB_PORT || 3306,

    waitForConnections: true,

    connectionLimit: 10,

    queueLimit: 0,

    ssl: process.env.DB_HOST && process.env.DB_HOST !== "localhost" ? {
        minVersion: "TLSv1.2",
        rejectUnauthorized: true
    } : null

});


db.getConnection((err, connection) => {

    if (err) {

        console.error(
            "MySQL connection failed:"
        );

        console.error(err.message);

    } else {

        console.log(
            "MySQL connected successfully"
        );

        connection.release();

    }

});


// =========================
// AUTH MIDDLEWARE
// =========================

function requireLogin(req, res, next) {

    if (!req.session.userId) {

        return res.status(401).json({

            error: "Please login first"

        });

    }

    next();

}


// =========================
// SIGN UP
// =========================

app.post("/api/signup", async (req, res) => {

    const {
        name,
        email,
        password
    } = req.body;


    if (!name || !email || !password) {

        return res.status(400).json({

            error: "Please fill all fields"

        });

    }


    if (password.length < 6) {

        return res.status(400).json({

            error:
                "Password must contain at least 6 characters"

        });

    }


    try {

        const checkSql =
            "SELECT id FROM users WHERE email = ?";


        db.query(
            checkSql,
            [email],
            async (err, results) => {

                if (err) {

                    console.error(err);

                    return res.status(500).json({

                        error:
                            "Database error"

                    });

                }


                if (results.length > 0) {

                    return res.status(400).json({

                        error:
                            "Email already registered"

                    });

                }


                const hashedPassword =
                    await bcrypt.hash(
                        password,
                        10
                    );


                const insertSql = `
                    INSERT INTO users
                    (name, email, password)
                    VALUES (?, ?, ?)
                `;


                db.query(
                    insertSql,

                    [
                        name,
                        email,
                        hashedPassword
                    ],

                    (err, result) => {

                        if (err) {

                            console.error(err);

                            return res.status(500).json({

                                error:
                                    "Failed to create account"

                            });

                        }


                        res.json({

                            message:
                                "Account created successfully",

                            userId:
                                result.insertId

                        });

                    }
                );

            }
        );

    } catch (error) {

        console.error(error);

        res.status(500).json({

            error:
                "Server error"

        });

    }

});


// =========================
// LOGIN
// =========================

app.post("/api/login", (req, res) => {

    const {
        email,
        password
    } = req.body;


    if (!email || !password) {

        return res.status(400).json({

            error:
                "Please enter email and password"

        });

    }


    const sql =
        "SELECT * FROM users WHERE email = ?";


    db.query(
        sql,
        [email],
        async (err, results) => {

            if (err) {

                console.error(err);

                return res.status(500).json({

                    error:
                        "Database error"

                });

            }


            if (results.length === 0) {

                return res.status(401).json({

                    error:
                        "Invalid email or password"

                });

            }


            const user = results[0];


            const passwordMatch =
                await bcrypt.compare(
                    password,
                    user.password
                );


            if (!passwordMatch) {

                return res.status(401).json({

                    error:
                        "Invalid email or password"

                });

            }


            req.session.userId =
                user.id;

            req.session.userName =
                user.name;

            req.session.userEmail =
                user.email;


            res.json({

                message:
                    "Login successful",

                user: {

                    id: user.id,

                    name: user.name,

                    email: user.email

                }

            });

        }
    );

});


// =========================
// LOGOUT
// =========================

app.post("/api/logout", (req, res) => {

    req.session.destroy((err) => {

        if (err) {

            return res.status(500).json({

                error:
                    "Logout failed"

            });

        }


        res.clearCookie("connect.sid");


        res.json({

            message:
                "Logged out successfully"

        });

    });

});


// =========================
// CURRENT USER
// =========================

app.get("/api/me", (req, res) => {

    if (!req.session.userId) {

        return res.status(401).json({

            loggedIn: false

        });

    }


    res.json({

        loggedIn: true,

        user: {

            id:
                req.session.userId,

            name:
                req.session.userName,

            email:
                req.session.userEmail

        }

    });

});


// =========================
// GET TRANSACTIONS
// =========================

app.get(
    "/api/transactions",
    requireLogin,
    (req, res) => {

        const sql = `

            SELECT
                id,
                type,
                category,
                description,
                amount,
                DATE_FORMAT(
                    transaction_date,
                    '%Y-%m-%d'
                ) AS transaction_date

            FROM transactions

            WHERE user_id = ?

            ORDER BY
                transaction_date DESC,
                id DESC

        `;


        db.query(
            sql,
            [req.session.userId],
            (err, results) => {

                if (err) {

                    console.error(err);

                    return res.status(500).json({

                        error:
                            "Failed to fetch transactions"

                    });

                }


                res.json(results);

            }
        );

    }
);


// =========================
// ADD TRANSACTION
// =========================

app.post("/api/transactions", requireLogin, (req, res) => {

    const {
        type,
        category,
        description,
        amount,
        transaction_date
    } = req.body;


    if (!type || !category || !amount || !transaction_date) {

        return res.status(400).json({

            error: "Please fill all required fields"

        });

    }


    const sql = `
        INSERT INTO transactions
        (user_id, type, category, description, amount, transaction_date)
        VALUES (?, ?, ?, ?, ?, ?)
    `;


    db.query(
        sql,
        [
            req.session.userId,
            type,
            category,
            description,
            amount,
            transaction_date
        ],
        (err, result) => {

            if (err) {

                console.error(err);

                return res.status(500).json({

                    error: "Failed to add transaction"

                });

            }


            res.json({

                message: "Transaction added successfully",

                transactionId: result.insertId

            });

        }
    );

});


// ===============================================
// NATIVE CONDITIONAL LANDING ROUTE (EXPRESS 5)
// ===============================================

// Serves the authentic login page immediately if no active user exists
app.get("/", (req, res) => {
    if (req.session.userId) {
        res.sendFile(path.join(__dirname, "public", "index.html"));
    } else {
        res.sendFile(path.join(__dirname, "public", "login.html"));
