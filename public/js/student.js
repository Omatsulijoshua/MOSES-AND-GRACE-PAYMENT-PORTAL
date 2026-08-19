document.addEventListener('DOMContentLoaded', () => {
    const studentToken = localStorage.getItem('studentToken');
    if (!studentToken) {
        window.location.href = 'index.html?auth=login';
        return;
    }

    async function studentFetch(url, options = {}) {
        const headers = {
            ...(options.headers || {}),
            'Authorization': `Bearer ${studentToken}`
        };

        const res = await fetch(url, { ...options, headers });
        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('studentToken');
            localStorage.removeItem('studentId');
            window.location.href = 'index.html?auth=login&expired=true';
            throw new Error('Session expired');
        }

        return res;
    }

    const tableBody = document.getElementById('fees-table-body');
    const modal = document.getElementById('modal-payment');
    const btnCloseModal = document.getElementById('btn-close-payment');
    const form = document.getElementById('form-payment');
    const paymentFeeTitle = document.getElementById('payment-fee-title');
    const paymentFeeAmount = document.getElementById('payment-fee-amount');

    let fees = [];
    let selectedFee = null;
    
    // Keep legacy studentId only for display compatibility; the backend uses the signed token.
    const studentId = localStorage.getItem('studentId');

    // Check for payment status in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
        const reference = urlParams.get('reference');
        if (reference) {
            verifyReturnedPayment(reference);
        } else {
            alert('Payment returned from OPay. Please refresh your dashboard to confirm the status.');
        }
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('payment') === 'failed') {
        alert('Payment Failed or Cancelled.');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // View Switching Logic
    const links = document.querySelectorAll('.sidebar nav ul li a');
    const views = {
        'link-fees': document.getElementById('view-fees'),
        'link-history': document.getElementById('view-history'),
        'link-profile': document.getElementById('view-profile'),
        'link-tickets': document.getElementById('view-tickets')
    };

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            Object.values(views).forEach(v => v.style.display = 'none');
            const viewId = link.id;
            if (views[viewId]) {
                views[viewId].style.display = 'block';
                if (viewId === 'link-history') fetchHistory();
                if (viewId === 'link-profile') fetchProfile();
                if (viewId === 'link-tickets') {
                    fetchTickets();
                    fetchPaymentsForDropdown();
                }
            }
        });
    });

    // Fetch student info and fees
    async function fetchStudentData() {
        try {
            // Fetch profile for header
            const profileRes = await studentFetch(`/api/student/profile?studentId=${studentId}`);
            const profileData = await profileRes.json();
            document.getElementById('student-name').textContent = profileData.name;
            document.getElementById('student-dept-level').textContent = `${profileData.department || 'N/A'} | ${profileData.level || 'N/A'}`;

            const res = await studentFetch(`/api/student/outstanding-fees?studentId=${studentId}`);
            fees = await res.json();
            renderFees();
            updateAnalytics();
        } catch (error) {
            console.error('Error fetching student data:', error);
        }
    }

    // Render fees in table
    function renderFees() {
        tableBody.innerHTML = '';
        fees.forEach(fee => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${fee.title}</td>
                <td>₦${fee.amount.toLocaleString()}</td>
                <td><span class="status-badge status-${fee.paymentStatus}">${fee.paymentStatus}</span></td>
                <td>${fee.dueDate ? new Date(fee.dueDate).toLocaleDateString() : 'N/A'}</td>
                <td>
                    ${fee.paymentStatus !== 'paid' ? `<button class="btn btn-primary btn-sm" onclick="openPaymentModal(${fee.id})">Pay</button>` : 'Paid'}
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // Update analytics cards
    function updateAnalytics() {
        const totalAssigned = fees.reduce((sum, f) => sum + f.amount, 0);
        const totalPaid = fees.reduce((sum, f) => sum + f.amountPaid, 0);
        const balance = fees.reduce((sum, f) => sum + f.balanceRemaining, 0);

        document.getElementById('total-assigned').textContent = `₦${totalAssigned.toLocaleString()}`;
        document.getElementById('total-paid').textContent = `₦${totalPaid.toLocaleString()}`;
        document.getElementById('outstanding-balance').textContent = `₦${balance.toLocaleString()}`;
    }

    // Open payment modal
    window.openPaymentModal = (id) => {
        selectedFee = fees.find(f => f.id === id);
        if (!selectedFee) return;

        paymentFeeTitle.textContent = selectedFee.title;
        paymentFeeAmount.textContent = `Amount: ₦${selectedFee.balanceRemaining.toLocaleString()}`;
        document.getElementById('pay-amount').value = selectedFee.balanceRemaining;

        modal.style.display = 'flex';
    };

    // Close modal
    btnCloseModal.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    async function startOpayPayment(paymentCategoryId, amount) {
        const res = await studentFetch('/api/student/initialize-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentId: studentId,
                paymentCategoryId,
                amount: amount
            })
        });

        const data = await res.json();
        if (data.status === 'success' && data.data.checkoutUrl) {
            window.location.href = data.data.checkoutUrl;
        } else {
            throw new Error(data.error || 'Unable to initialize OPay checkout');
        }
    }

    async function verifyReturnedPayment(reference) {
        try {
            const res = await studentFetch(`/api/student/verify-payment?reference=${encodeURIComponent(reference)}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Unable to verify OPay payment');
            }

            if (data.status === 'SUCCESS') {
                alert('Payment confirmed via OPay!');
            } else {
                alert(`OPay payment status: ${data.status}. Your dashboard will update after confirmation.`);
            }

            fetchStudentData();
        } catch (error) {
            console.error('Payment verification error:', error);
            alert('Payment returned from OPay, but verification failed. Please contact admin with your reference.');
        }
    }

    // Handle payment submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = document.getElementById('pay-amount').value;

        try {
            await startOpayPayment(selectedFee.id, amount);
        } catch (error) {
            alert(error.message);
        }
    });

    // Fetch Profile for Form
    async function fetchProfile() {
        try {
            // First fetch categories to populate dropdown
            const catRes = await studentFetch('/api/student/student-categories');
            const categories = await catRes.json();
            const deptSelect = document.getElementById('profile-dept');
            if (deptSelect) {
                deptSelect.innerHTML = '<option value="">-- Select Department --</option>';
                categories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat.name;
                    option.textContent = cat.name;
                    deptSelect.appendChild(option);
                });
            }

            const res = await studentFetch(`/api/student/profile?studentId=${studentId}`);
            const data = await res.json();
            document.getElementById('profile-name').value = data.name;
            document.getElementById('profile-email').value = data.email;
            document.getElementById('profile-dept').value = data.department || '';
            document.getElementById('profile-level').value = data.level || '';
            document.getElementById('profile-session').value = data.session || '';
        } catch (error) {
            console.error('Error fetching profile data:', error);
        }
    }

    // Handle Fees Pay Button
    const btnFeesPay = document.getElementById('btn-fees-pay');
    if (btnFeesPay) {
        btnFeesPay.addEventListener('click', async () => {
            const balance = fees.reduce((sum, f) => sum + f.balanceRemaining, 0);
            if (balance <= 0) {
                alert('You have no outstanding fees to pay.');
                return;
            }
            
            try {
                const firstUnpaidFee = fees.find(f => f.balanceRemaining > 0);
                await startOpayPayment(firstUnpaidFee.id, firstUnpaidFee.balanceRemaining);
            } catch (error) {
                console.error('Error:', error);
                alert(error.message || 'An error occurred while connecting to the payment gateway.');
            }
        });
    }

    // Handle Profile Edit Toggle
    const btnEditProfile = document.getElementById('btn-edit-profile');
    const btnSaveProfile = document.getElementById('btn-save-profile');
    const profileInputs = [
        document.getElementById('profile-name'),
        document.getElementById('profile-email'),
        document.getElementById('profile-dept'),
        document.getElementById('profile-level'),
        document.getElementById('profile-session'),
        document.getElementById('profile-password')
    ];

    if (btnEditProfile) {
        btnEditProfile.addEventListener('click', () => {
            profileInputs.forEach(input => {
                if (input.tagName === 'SELECT') {
                    input.removeAttribute('disabled');
                } else {
                    input.removeAttribute('readonly');
                }
            });
            btnEditProfile.style.display = 'none';
            btnSaveProfile.style.display = 'block';
        });
    }

    // Handle Profile Update
    const formProfile = document.getElementById('form-profile');
    if (formProfile) {
        formProfile.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('profile-name').value;
            const email = document.getElementById('profile-email').value;
            const department = document.getElementById('profile-dept').value;
            const level = document.getElementById('profile-level').value;
            const session = document.getElementById('profile-session').value;
            const password = document.getElementById('profile-password').value;

            const res = await studentFetch('/api/student/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId, name, email, department, level, session, password })
            });

            if (res.ok) {
                alert('Profile updated successfully!');
                fetchStudentData(); // Refresh header
                
                // Toggle back to read-only/disabled
                profileInputs.forEach(input => {
                    if (input.tagName === 'SELECT') {
                        input.setAttribute('disabled', true);
                    } else {
                        input.setAttribute('readonly', true);
                    }
                });
                btnEditProfile.style.display = 'block';
                btnSaveProfile.style.display = 'none';
                document.getElementById('profile-password').value = ''; // Clear password field
            } else {
                alert('Error updating profile');
            }
        });
    }

    // Fetch Payment History
    async function fetchHistory() {
        const res = await studentFetch(`/api/student/history?studentId=${studentId}`);
        const data = await res.json();
        const historyTableBody = document.getElementById('history-table-body');
        historyTableBody.innerHTML = '';
        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(item.paidAt).toLocaleDateString()}</td>
                <td>${item.paymentCategory.title}</td>
                <td>₦${item.amountPaid.toLocaleString()}</td>
                <td>${item.reference || 'N/A'}</td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="printReceipt('${item.reference}', '${item.paymentCategory.title}', ${item.amountPaid}, '${item.paidAt}')">Print Receipt</button>
                </td>
            `;
            historyTableBody.appendChild(tr);
        });
    }

    // Print Receipt
    window.printReceipt = (reference, title, amount, date) => {
        const win = window.open('', '_blank');
        win.document.write(`
            <html>
            <head>
                <title>Receipt - ${reference}</title>
                <style>
                    body { font-family: 'Outfit', sans-serif; padding: 2rem; color: #0f172a; }
                    .header { text-align: center; margin-bottom: 2rem; }
                    .logo h1 { color: #dc2626; margin-bottom: 0.5rem; }
                    .logo span { color: #16a34a; font-weight: 600; }
                    .details { margin-bottom: 2rem; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 1rem 0; }
                    .details div { margin-bottom: 0.5rem; display: flex; justify-content: space-between; }
                    .footer { text-align: center; color: #64748b; margin-top: 3rem; font-size: 0.9rem; }
                    .btn { display: inline-block; padding: 0.5rem 1rem; border-radius: 8px; text-decoration: none; font-weight: 600; cursor: pointer; border: none; }
                    .btn-primary { background: #dc2626; color: white; }
                    @media print {
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="logo">
                        <h1>MOSES & GRACE</h1>
                        <span>College of Health Science & Technology</span>
                    </div>
                    <br>
                    <h2>Official Payment Receipt</h2>
                </div>
                <div class="details">
                    <div><span><strong>Student Name:</strong></span> <span>${document.getElementById('student-name').textContent}</span></div>
                    <div><span><strong>Fee Title:</strong></span> <span>${title}</span></div>
                    <div><span><strong>Amount Paid:</strong></span> <span>₦${amount.toLocaleString()}</span></div>
                    <div><span><strong>Date:</strong></span> <span>${new Date(date).toLocaleDateString()}</span></div>
                    <div><span><strong>OPay Transaction ID:</strong></span> <span>${reference}</span></div>
                </div>
                <div class="footer">
                    <p>Thank you for your payment.</p>
                    <p>This is a computer generated receipt and requires no signature.</p>
                </div>
                <br>
                <div style="text-align: center;">
                    <button class="no-print btn btn-primary" onclick="window.print()">Print Receipt</button>
                </div>
            </body>
            </html>
        `);
        win.document.close();
    };

    // Fetch Tickets
    async function fetchTickets() {
        const res = await studentFetch(`/api/student/tickets?studentId=${studentId}`);
        const data = await res.json();
        const ticketsTableBody = document.getElementById('tickets-table-body');
        ticketsTableBody.innerHTML = '';
        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(item.createdAt).toLocaleDateString()}</td>
                <td>${item.subject}</td>
                <td><span class="status-badge status-${item.status}">${item.status}</span></td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="viewTicketDetails(${item.id})">View</button>
                </td>
            `;
            ticketsTableBody.appendChild(tr);
        });
    }

    // Fetch Payments for Dropdown
    async function fetchPaymentsForDropdown() {
        const res = await studentFetch(`/api/student/outstanding-fees?studentId=${studentId}`);
        const fees = await res.json();
        const select = document.getElementById('ticket-payment');
        select.innerHTML = '<option value="">None</option>';
        fees.forEach(fee => {
            const option = document.createElement('option');
            option.value = fee.id;
            option.textContent = `${fee.title} (₦${fee.amount.toLocaleString()})`;
            select.appendChild(option);
        });
    }

    // Handle Ticket Submit
    const formTicket = document.getElementById('form-ticket');
    if (formTicket) {
        formTicket.addEventListener('submit', async (e) => {
            e.preventDefault();
            const subject = document.getElementById('ticket-subject').value;
            const studentPaymentId = document.getElementById('ticket-payment').value;
            const message = document.getElementById('ticket-message').value;

            const res = await studentFetch('/api/student/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentId,
                    subject,
                    message,
                    studentPaymentId: studentPaymentId || null
                })
            });

            if (res.ok) {
                alert('Ticket submitted successfully!');
                formTicket.reset();
                fetchTickets();
            } else {
                alert('Error submitting ticket');
            }
        });
    }

    // View Ticket Details
    window.viewTicketDetails = async (id) => {
        const res = await studentFetch(`/api/student/tickets?studentId=${studentId}`);
        const tickets = await res.json();
        const ticket = tickets.find(t => t.id === id);
        if (ticket) {
            alert(`Subject: ${ticket.subject}\nMessage: ${ticket.message}\nStatus: ${ticket.status}`);
        }
    };

    // Initial fetch
    fetchStudentData();
});

