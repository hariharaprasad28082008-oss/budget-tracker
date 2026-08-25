// ===============================
// BUDGET TRACKER - SCRIPT.JS
// ===============================


// ===============================
// GLOBAL VARIABLES
// ===============================

let expenseChart = null;


// ===============================
// GET HTML ELEMENTS
// ===============================

const form = document.getElementById("transactionForm");

const typeInput = document.getElementById("type");

const categoryInput = document.getElementById("category");

const descriptionInput =
    document.getElementById("description");

const amountInput =
    document.getElementById("amount");

const dateInput =
    document.getElementById("transaction_date");

const transactionTable =
    document.getElementById("transactionTable");

const totalIncome =
    document.getElementById("totalIncome");

const totalExpense =
    document.getElementById("totalExpense");

const balance =
    document.getElementById("balance");

const welcomeUser =
    document.getElementById("welcomeUser");

const chartMessage =
    document.getElementById("chartMessage");


// ===============================
// PAGE LOAD
// ===============================

document.addEventListener(
    "DOMContentLoaded",
    async function () {

        console.log("Budget Tracker loaded");


        // Set today's date

        if (dateInput) {

            const today =
                new Date()
                    .toISOString()
                    .split("T")[0];

            dateInput.value = today;
        }


        // Check login

        const loggedIn =
            await checkUser();


        if (!loggedIn) {
            return;
        }


        // Load dashboard

        await loadTransactions();

        await loadSummary();

        await loadExpenseChart();

    }
);


// ===============================
// CHECK LOGIN (FIXED INFINITE LOOP)
// ===============================

async function checkUser() {

    try {

        const response =
            await fetch(
                "/api/me",
                {
                    credentials: "include"
                }
            );


        if (!response.ok) {
            // FIX: If the user is unauthenticated, redirect them directly to your standalone login file
            window.location.href = "/login.html";

            return false;
        }


        const data =
            await response.json();


        if (
            data.user &&
            welcomeUser
        ) {

            welcomeUser.textContent =
                "Hi, " + data.user.name;

        }


        return true;

    }

    catch (error) {

        console.error(
            "User check error:",
            error
        );

        // FIX: Prevent local crash network loop reloads
        window.location.href = "/login.html";

        return false;
    }
}


// ===============================
// ADD TRANSACTION
// ===============================

if (form) {

    form.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            const transaction = {

                type:
                    typeInput.value,

                category:
                    categoryInput.value,

                description:
                    descriptionInput.value.trim(),

                amount:
                    Number(
                        amountInput.value
                    ),

                transaction_date:
                    dateInput.value

            };


            // Basic validation

            if (!transaction.type) {

                alert(
                    "Please select transaction type."
                );

                return;
            }


            if (!transaction.category) {

                alert(
                    "Please select a category."
                );

                return;
            }


            if (
                !transaction.amount ||
                transaction.amount <= 0
            ) {

                alert(
                    "Please enter a valid amount."
                );

                return;
            }


            try {

                const response =
                    await fetch(
                        "/api/transactions",
                        {

                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            credentials:
                                "include",

                            body:
                                JSON.stringify(
                                    transaction
                                )

                        }
                    );


                const data =
                    await response.json();


                // Login expired

                if (
                    response.status === 401
                ) {

                    window.location.href = "/login.html";

                    return;
                }


                // Server error

                if (!response.ok) {

                    alert(
                        data.error ||
                        "Failed to add transaction."
                    );

                    return;
                }


                alert(
                    "Transaction added successfully!"
                );


                // Reset form

                form.reset();


                // Set today's date again

                const today =
                    new Date()
                        .toISOString()
                        .split("T")[0];


                dateInput.value =
                    today;


                // Refresh everything

                await loadTransactions();

                await loadSummary();

                await loadExpenseChart();

            }

            catch (error) {

                console.error(
                    "Add transaction error:",
                    error
                );


                alert(
                    "Server connection failed."
                );
            }

        }
    );

}


// ===============================
// LOAD TRANSACTIONS
// ===============================

async function loadTransactions() {

    try {

        const response =
            await fetch(
                "/api/transactions",
                {
                    credentials:
                        "include"
                }
            );


        if (
            response.status === 401
        ) {

            window.location.href = "/login.html";

            return;
        }


        const transactions =
            await response.json();


        transactionTable.innerHTML =
            "";


        // No transactions

        if (
            !transactions ||
            transactions.length === 0
        ) {

            transactionTable.innerHTML = `

                <tr>

                    <td
                        colspan="6"
                        class="text-center text-muted py-4">

                        No transactions found.

                    </td>

                </tr>

            `;

            return;
        }


        // Display transactions

        transactions.forEach(
            function (transaction) {

                const row =
                    document.createElement(
                        "tr"
                    );


                const amount =
                    Number(
                        transaction.amount
                    ).toFixed(2);


                const isIncome =
                    transaction.type ===
                    "income";


                const typeClass =
                    isIncome
                        ? "income"
                        : "expense";


                const sign =
                    isIncome
                        ? "+"
                        : "-";


                row.innerHTML = `

                    <td>

                        <span
                            class="${typeClass}">

                            ${transaction.type.toUpperCase()}

                        </span>

                    </td>


                    <td>
                        <span>${transaction.category}</span>
                    </td>
                `;
            }
        );
    } catch (e) {
        console.error(e);
    }
}
