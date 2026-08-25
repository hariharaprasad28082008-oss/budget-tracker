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
// CHECK LOGIN
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

            window.location.href = "/login";

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


        window.location.href =
            "/login";


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

                    window.location.href =
                        "/login";

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

            window.location.href =
                "/login";

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

                        ${escapeHTML(
                            transaction.category
                        )}

                    </td>


                    <td>

                        ${escapeHTML(
                            transaction.description || ""
                        )}

                    </td>


                    <td
                        class="${typeClass}">

                        ${sign} ₹${amount}

                    </td>


                    <td>

                        ${transaction.transaction_date}

                    </td>


                    <td>

                        <button
                            class="btn btn-sm btn-danger"
                            onclick="deleteTransaction(${transaction.id})">

                            Delete

                        </button>

                    </td>

                `;


                transactionTable.appendChild(
                    row
                );

            }
        );

    }

    catch (error) {

        console.error(
            "Transaction loading error:",
            error
        );

    }
}


// ===============================
// LOAD SUMMARY
// ===============================

async function loadSummary() {

    try {

        const response =
            await fetch(
                "/api/summary",
                {
                    credentials:
                        "include"
                }
            );


        if (
            response.status === 401
        ) {

            window.location.href =
                "/login";

            return;
        }


        const data =
            await response.json();


        const income =
            Number(
                data.totalIncome || 0
            );


        const expense =
            Number(
                data.totalExpense || 0
            );


        const currentBalance =
            Number(
                data.balance || 0
            );


        // Income

        totalIncome.textContent =
            "₹" +
            income.toFixed(2);


        // Expense

        totalExpense.textContent =
            "₹" +
            expense.toFixed(2);


        // Balance

        balance.textContent =
            "₹" +
            currentBalance.toFixed(2);


        // Balance color

        if (
            currentBalance < 0
        ) {

            balance.classList.remove(
                "text-success"
            );

            balance.classList.add(
                "text-danger"
            );

        }

        else {

            balance.classList.remove(
                "text-danger"
            );

            balance.classList.add(
                "text-success"
            );

        }

    }

    catch (error) {

        console.error(
            "Summary error:",
            error
        );

    }
}


// ===============================
// LOAD EXPENSE PIE CHART
// ===============================

async function loadExpenseChart() {

    console.log(
        "Loading expense chart..."
    );


    const canvas =
        document.getElementById(
            "expenseChart"
        );


    // Check canvas

    if (!canvas) {

        console.error(
            "ERROR: expenseChart canvas not found!"
        );

        return;
    }


    // Check Chart.js

    if (
        typeof Chart === "undefined"
    ) {

        console.error(
            "ERROR: Chart.js is not loaded!"
        );


        if (chartMessage) {

            chartMessage.style.display =
                "block";

            chartMessage.textContent =
                "Chart.js failed to load.";

        }

        return;
    }


    console.log(
        "Chart.js loaded successfully."
    );


    try {

        const response =
            await fetch(
                "/api/expense-chart",
                {
                    credentials:
                        "include"
                }
            );


        console.log(
            "Expense chart API status:",
            response.status
        );


        // Login expired

        if (
            response.status === 401
        ) {

            window.location.href =
                "/login";

            return;
        }


        const data =
            await response.json();


        console.log(
            "Expense chart data:",
            data
        );


        if (!response.ok) {

            if (chartMessage) {

                chartMessage.style.display =
                    "block";

                chartMessage.textContent =
                    data.error ||
                    "Unable to load chart.";

            }

            return;
        }


        // Destroy previous chart

        if (expenseChart) {

            expenseChart.destroy();

            expenseChart = null;

        }


        // No expenses

        if (
            !data ||
            data.length === 0
        ) {

            canvas.style.display =
                "none";


            if (chartMessage) {

                chartMessage.style.display =
                    "block";

                chartMessage.textContent =
                    "Add an expense to see your pie chart.";

            }


            console.log(
                "No expense data available."
            );


            return;
        }


        // Show canvas

        canvas.style.display =
            "block";


        if (chartMessage) {

            chartMessage.style.display =
                "none";

        }


        // ===========================
        // CHART LABELS
        // ===========================

        const labels =
            data.map(
                function (item) {

                    return item.category;

                }
            );


        // ===========================
        // CHART VALUES
        // ===========================

        const values =
            data.map(
                function (item) {

                    return Number(
                        item.total
                    );

                }
            );


        console.log(
            "Chart labels:",
            labels
        );


        console.log(
            "Chart values:",
            values
        );


        // ===========================
        // PIE CHART
        // ===========================

        expenseChart =
            new Chart(
                canvas,
                {

                    type: "pie",


                    data: {

                        labels: labels,


                        datasets: [

                            {

                                label:
                                    "Expenses",


                                data:
                                    values,


                                // Different colors

                                backgroundColor: [

                                    "#ff6384",

                                    "#36a2eb",

                                    "#ffcd56",

                                    "#4bc0c0",

                                    "#9966ff",

                                    "#ff9f40",

                                    "#36a854",

                                    "#e74c3c",

                                    "#8e44ad",

                                    "#16a085"

                                ],


                                borderColor:
                                    "#ffffff",


                                borderWidth:
                                    2

                            }

                        ]

                    },


                    options: {

                        responsive:
                            true,


                        maintainAspectRatio:
                            false,


                        plugins: {

                            legend: {

                                display:
                                    true,

                                position:
                                    "bottom"

                            },


                            tooltip: {

                                callbacks: {

                                    label:
                                        function (
                                            context
                                        ) {

                                            const amount =
                                                Number(
                                                    context.raw
                                                ).toFixed(
                                                    2
                                                );


                                            return (
                                                context.label +
                                                ": ₹" +
                                                amount
                                            );

                                        }

                                }

                            }

                        }

                    }

                }
            );


        console.log(
            "Pie chart created successfully!"
        );

    }

    catch (error) {

        console.error(
            "PIE CHART ERROR:",
            error
        );


        if (chartMessage) {

            chartMessage.style.display =
                "block";

            chartMessage.textContent =
                "Error loading pie chart.";

        }

    }
}


// ===============================
// DELETE TRANSACTION
// ===============================

async function deleteTransaction(id) {

    const confirmed =
        confirm(
            "Are you sure you want to delete this transaction?"
        );


    if (!confirmed) {
        return;
    }


    try {

        const response =
            await fetch(
                `/api/transactions/${id}`,
                {

                    method:
                        "DELETE",

                    credentials:
                        "include"

                }
            );


        const data =
            await response.json();


        // Login expired

        if (
            response.status === 401
        ) {

            window.location.href =
                "/login";

            return;
        }


        if (!response.ok) {

            alert(
                data.error ||
                "Failed to delete transaction."
            );

            return;
        }


        alert(
            "Transaction deleted successfully!"
        );


        // Refresh dashboard

        await loadTransactions();

        await loadSummary();

        await loadExpenseChart();

    }

    catch (error) {

        console.error(
            "Delete error:",
            error
        );


        alert(
            "Server connection failed."
        );

    }
}


// ===============================
// LOGOUT
// ===============================

async function logout() {

    try {

        await fetch(
            "/api/logout",
            {

                method:
                    "POST",

                credentials:
                    "include"

            }
        );


        window.location.href =
            "/login";

    }

    catch (error) {

        console.error(
            "Logout error:",
            error
        );

    }
}


// ===============================
// ESCAPE HTML
// ===============================

function escapeHTML(value) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        value;


    return div.innerHTML;
}
