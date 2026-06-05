document.addEventListener('DOMContentLoaded', () => {
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
        window.location.href = 'admin-login.html';
        return;
    }

    async function adminFetch(url, options = {}) {
        const headers = {
            ...(options.headers || {}),
            'Authorization': `Bearer ${adminToken}`
        };

        const res = await fetch(url, { ...options, headers });
        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('adminToken');
            alert('Admin session expired. Please sign in again.');
            window.location.href = 'admin-login.html';
            throw new Error('Admin session expired');
        }

        return res;
    }

    const tableBody = document.getElementById('categories-table-body');
    const btnNewCategory = document.getElementById('btn-new-category');
    const modal = document.getElementById('modal-category');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const form = document.getElementById('form-category');
    const modalTitle = document.getElementById('modal-title');

    let categories = [];
    let editingId = null;

    // Fetch categories
    async function fetchCategories() {
        try {
            const res = await adminFetch('/api/admin/payment-categories');
            categories = await res.json();
            renderCategories();
            fetchAnalytics();
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    }

    // Render categories in table
    function renderCategories() {
        tableBody.innerHTML = '';
        categories.forEach(cat => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${cat.title}</td>
                <td>${cat.studentName || 'All Students'}</td>
                <td>₦${cat.amount.toLocaleString()}</td>
                <td>${cat.paymentType}</td>
                <td>${cat.academicSession}</td>
                <td><span class="status-badge status-${cat.status}">${cat.status}</span></td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="editCategory(${cat.id})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteCategory(${cat.id})">Delete</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // Fetch and update analytics
    async function fetchAnalytics() {
        try {
            const startDate = document.getElementById('start-date').value;
            const endDate = document.getElementById('end-date').value;
            
            let url = '/api/admin/analytics';
            if (startDate && endDate) {
                url += `?startDate=${startDate}&endDate=${endDate}`;
            }

            const res = await adminFetch(url);
            const data = await res.json();
            
            document.getElementById('payments-today').textContent = `₦${data.paymentsToday.toLocaleString()}`;
            document.getElementById('total-received').textContent = `₦${data.totalReceived.toLocaleString()}`;
            document.getElementById('pending-payments').textContent = data.pendingPayments;
            document.getElementById('total-expected').textContent = `₦${data.totalExpected.toLocaleString()}`;
            document.getElementById('total-categories').textContent = categories.length;
            document.getElementById('active-categories').textContent = categories.filter(c => c.status === 'active').length;

            // Update label based on filter
            const paymentsTodayCard = document.getElementById('payments-today').parentElement;
            const cardTitle = paymentsTodayCard.querySelector('h3');
            if (data.isFiltered) {
                cardTitle.textContent = 'Payments in Range';
            } else {
                cardTitle.textContent = 'Payments Made Today';
            }

            // Render payments table
            const paymentsTableBody = document.getElementById('payments-table-body');
            paymentsTableBody.innerHTML = '';
            if (data.payments && data.payments.length > 0) {
                data.payments.forEach(p => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${p.student.name}</td>
                        <td>${p.paymentCategory.title}</td>
                        <td>₦${p.amountPaid.toLocaleString()}</td>
                        <td>${new Date(p.paidAt).toLocaleDateString()}</td>
                        <td><span class="status-badge status-${p.status}">${p.status}</span></td>
                    `;
                    paymentsTableBody.appendChild(tr);
                });
            } else {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td colspan="5" style="text-align:center;">No payments found</td>`;
                paymentsTableBody.appendChild(tr);
            }
        } catch (error) {
            console.error('Error fetching analytics:', error);
        }
    }

    // Filter event listeners
    document.getElementById('btn-apply-filter').addEventListener('click', () => {
        fetchAnalytics();
    });

    document.getElementById('btn-clear-filter').addEventListener('click', () => {
        document.getElementById('start-date').value = '';
        document.getElementById('end-date').value = '';
        fetchAnalytics();
    });

    // Open modal for create
    btnNewCategory.addEventListener('click', () => {
        editingId = null;
        modalTitle.textContent = 'Create Payment Category';
        form.reset();
        modal.style.display = 'flex';
    });

    // Close modal
    btnCloseModal.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Handle form submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            title: document.getElementById('title').value,
            amount: document.getElementById('amount').value,
            paymentType: document.getElementById('paymentType').value,
            academicSession: document.getElementById('academicSession').value,
            department: document.getElementById('department').value,
            level: document.getElementById('level').value,
            status: document.getElementById('status').value,
        };

        let res;
        if (editingId) {
            res = await adminFetch(`/api/admin/payment-categories/${editingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            res = await adminFetch('/api/admin/payment-categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }

        if (res.ok) {
            modal.style.display = 'none';
            fetchCategories();
        } else {
            alert('Error saving category');
        }
    });

    // Edit category
    window.editCategory = (id) => {
        const cat = categories.find(c => c.id === id);
        if (!cat) return;

        editingId = id;
        modalTitle.textContent = 'Edit Payment Category';
        
        document.getElementById('title').value = cat.title;
        document.getElementById('amount').value = cat.amount;
        document.getElementById('paymentType').value = cat.paymentType;
        document.getElementById('academicSession').value = cat.academicSession;
        document.getElementById('department').value = cat.department || '';
        document.getElementById('level').value = cat.level || '';
        document.getElementById('status').value = cat.status;

        modal.style.display = 'flex';
    };

    // Delete category
    window.deleteCategory = async (id) => {
        if (!confirm('Are you sure you want to delete this category?')) return;

        const res = await adminFetch(`/api/admin/payment-categories/${id}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            fetchCategories();
        } else {
            alert('Error deleting category');
        }
    };

    // Sidebar navigation
    const navLinks = {
        'link-categories': 'view-categories',
        'link-student-categories': 'view-student-categories',
        'link-admin-mgmt': 'view-admin-mgmt',
        'link-reports': 'view-reports',
        'link-verify-payment': 'view-verify-payment',
        'link-students': 'view-students',
        'link-tickets': 'view-tickets'
    };

    Object.entries(navLinks).forEach(([linkId, viewId]) => {
        const link = document.getElementById(linkId);
        const view = document.getElementById(viewId);
        
        if (link && view) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Remove active from all links
                Object.keys(navLinks).forEach(id => {
                    const l = document.getElementById(id);
                    if (l) l.classList.remove('active');
                });
                
                // Hide all views
                Object.values(navLinks).forEach(id => {
                    const v = document.getElementById(id);
                    if (v) v.style.display = 'none';
                });
                
                // Activate clicked
                link.classList.add('active');
                view.style.display = 'block';
                
                // Specific actions
                if (linkId === 'link-reports') {
                    fetchReports();
                }
                if (linkId === 'link-students') {
                    fetchStudents();
                }
                if (linkId === 'link-tickets') {
                    fetchTickets();
                }
                if (linkId === 'link-student-categories') {
                    fetchStudentCategories();
                }
            });
        }
    });

    function formatCurrency(amount) {
        return `₦${Number(amount || 0).toLocaleString()}`;
    }

    function formatDate(date) {
        return date ? new Date(date).toLocaleString() : 'N/A';
    }

    function renderVerificationResult(data) {
        const result = document.getElementById('verify-payment-result');
        const payment = data.payment;
        const opay = data.opay || {};
        const opayStatus = String(opay.status || 'unknown');
        const opayStatusClass = opayStatus.toLowerCase();

        if (!payment) {
            result.innerHTML = `
                <h3>Transaction Not Found in Portal</h3>
                <p style="margin-top: 0.75rem;">No student payment record was found for this transaction ID.</p>
                <p><strong>OPay check:</strong> ${opay.checked ? `${opayStatus} ${opay.message ? `- ${opay.message}` : ''}` : opay.message}</p>
            `;
            result.style.display = 'block';
            return;
        }

        result.innerHTML = `
            <h3>Verified Payment Details</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-top: 1rem;">
                <div><strong>Student Name</strong><br>${payment.student ? payment.student.name : 'Unknown'}</div>
                <div><strong>Email</strong><br>${payment.student ? payment.student.email : 'N/A'}</div>
                <div><strong>Department / Level</strong><br>${payment.student ? `${payment.student.department || 'N/A'} / ${payment.student.level || 'N/A'}` : 'N/A'}</div>
                <div><strong>Fee</strong><br>${payment.paymentCategory ? payment.paymentCategory.title : 'Unknown'}</div>
                <div><strong>Amount Paid</strong><br>${formatCurrency(payment.amountPaid)}</div>
                <div><strong>Balance</strong><br>${formatCurrency(payment.balanceRemaining)}</div>
                <div><strong>Portal Status</strong><br><span class="status-badge status-${payment.status}">${payment.status}</span></div>
                <div><strong>OPay Status</strong><br><span class="status-badge status-${opayStatusClass}">${opayStatus}</span></div>
                <div><strong>Transaction ID</strong><br>${payment.reference || 'N/A'}</div>
                <div><strong>Paid Time</strong><br>${formatDate(payment.paidAt)}</div>
                <div><strong>Recorded Time</strong><br>${formatDate(payment.createdAt)}</div>
            </div>
            ${opay.message ? `<p style="margin-top: 1rem;"><strong>OPay Message:</strong> ${opay.message}</p>` : ''}
            <div style="margin-top: 1.5rem;">
                <button class="btn btn-primary" onclick="showReceipt(${payment.id})">Open Receipt</button>
            </div>
        `;
        result.style.display = 'block';
    }

    const formVerifyPayment = document.getElementById('form-verify-payment');
    if (formVerifyPayment) {
        formVerifyPayment.addEventListener('submit', async (e) => {
            e.preventDefault();
            const reference = document.getElementById('verify-reference').value.trim();
            const result = document.getElementById('verify-payment-result');

            result.style.display = 'block';
            result.innerHTML = '<p>Checking transaction...</p>';

            try {
                const res = await adminFetch('/api/admin/verify-payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reference })
                });
                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || 'Unable to verify payment');
                }

                renderVerificationResult(data);
                fetchAnalytics();
            } catch (error) {
                result.innerHTML = `<p style="color: #ff6b6b;">${error.message}</p>`;
            }
        });
    }

    // Fetch and populate admins dropdown
    async function fetchAdmins() {
        try {
            const res = await adminFetch('/api/admin/admins');
            const admins = await res.json();
            
            const dropdown = document.getElementById('cp-username');
            // Keep the first option
            dropdown.innerHTML = '<option value="">-- Select Admin --</option>';
            
            admins.forEach(admin => {
                const option = document.createElement('option');
                option.value = admin.username;
                option.textContent = `${admin.name || admin.username} (${admin.username})`;
                dropdown.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching admins:', error);
        }
    }

    // Call fetchAdmins when Admin Mgmt is clicked
    const linkAdminMgmtLink = document.getElementById('link-admin-mgmt');
    if (linkAdminMgmtLink) {
        linkAdminMgmtLink.addEventListener('click', fetchAdmins);
    }

    // Handle Change Password
    const formChangePassword = document.getElementById('form-change-password');
    formChangePassword.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('cp-username').value;
        const newPassword = document.getElementById('cp-new-password').value;
        const confirmPassword = document.getElementById('cp-confirm-password').value;

        if (newPassword !== confirmPassword) {
            return alert('Passwords do not match!');
        }

        const res = await adminFetch('/api/admin/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, newPassword })
        });

        if (res.ok) {
            alert('Password updated successfully!');
            formChangePassword.reset();
        } else {
            const data = await res.json();
            alert(`Error: ${data.error || 'Failed to update password'}`);
        }
    });

    // Handle Add New Admin
    const formAddAdmin = document.getElementById('form-add-admin');
    formAddAdmin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('aa-username').value;
        const password = document.getElementById('aa-password').value;
        const confirmPassword = document.getElementById('aa-confirm-password').value;
        const name = document.getElementById('aa-name').value;

        if (password !== confirmPassword) {
            return alert('Passwords do not match!');
        }

        const res = await adminFetch('/api/admin/create-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, name })
        });

        if (res.ok) {
            alert('Admin created successfully!');
            formAddAdmin.reset();
            fetchAdmins(); // Refresh dropdown
        } else {
            const data = await res.json();
            alert(`Error: ${data.error || 'Failed to create admin'}`);
        }
    });



    // Render students to table
    function renderStudents(studentsList) {
        const studentsTableBody = document.getElementById('students-table-body');
        studentsTableBody.innerHTML = '';
        
        if (studentsList && studentsList.length > 0) {
            studentsList.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${s.name}</td>
                    <td>${s.email}</td>
                    <td>${s.department || 'N/A'}</td>
                    <td>${s.level || 'N/A'}</td>
                    <td>${s.session || 'N/A'}</td>
                    <td style="display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start;">
                        <button class="btn btn-success btn-sm" style="width: 130px; text-align: center;" onclick="viewStudentDetails(${s.id})">View Details</button>
                        <button class="btn btn-danger btn-sm" style="width: 130px; text-align: center;" onclick="openResetPasswordModal(${s.id})">Reset Password</button>
                    </td>
                `;
                studentsTableBody.appendChild(tr);
            });
        } else {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="6" style="text-align:center;">No students found</td>`;
            studentsTableBody.appendChild(tr);
        }
    }

    // Fetch and render students
    async function fetchStudents() {
        try {
            const res = await adminFetch('/api/admin/students');
            window.currentStudents = await res.json();
            renderStudents(window.currentStudents);
        } catch (error) {
            console.error('Error fetching students:', error);
        }
    }

    // Search students
    const searchInput = document.getElementById('search-student');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = window.currentStudents.filter(s => 
                s.name.toLowerCase().includes(query) || 
                s.email.toLowerCase().includes(query) ||
                (s.department && s.department.toLowerCase().includes(query))
            );
            renderStudents(filtered);
        });
    }

    // View Student Details
    window.viewStudentDetails = function(studentId) {
        const student = window.currentStudents.find(s => s.id === studentId);
        if (!student) return alert('Student not found');

        document.getElementById('sd-name').textContent = student.name;
        document.getElementById('sd-email').textContent = student.email;
        document.getElementById('sd-dept-level').textContent = `${student.department || 'N/A'} / ${student.level || 'N/A'}`;
        document.getElementById('sd-session').textContent = student.session || 'N/A';

        const tableBody = document.getElementById('student-payments-table-body');
        tableBody.innerHTML = '';

        if (student.payments && student.payments.length > 0) {
            student.payments.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${p.paymentCategory ? p.paymentCategory.title : 'Unknown'}</td>
                    <td>₦${p.amountPaid.toLocaleString()}</td>
                    <td>${new Date(p.paidAt).toLocaleDateString()}</td>
                    <td>${p.reference}</td>
                    <td><span class="status-badge status-${p.status}">${p.status}</span></td>
                    <td>
                        <button class="btn btn-primary btn-sm" onclick="showReceipt(${p.id})">Print Receipt</button>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
        } else {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="5" style="text-align:center;">No payments found</td>`;
            tableBody.appendChild(tr);
        }

        document.getElementById('view-students').style.display = 'none';
        document.getElementById('view-student-details').style.display = 'block';
    };

    // Back to Students
    document.getElementById('btn-back-to-students').addEventListener('click', () => {
        document.getElementById('view-student-details').style.display = 'none';
        document.getElementById('view-students').style.display = 'block';
    });

    // Print Student Details
    document.getElementById('btn-print-student-details').addEventListener('click', () => {
        // Inject print styles
        const style = document.createElement('style');
        style.id = 'print-styles';
        style.innerHTML = `
            @media print {
                body * {
                    visibility: hidden;
                }
                #view-student-details, #view-student-details * {
                    visibility: visible;
                }
                #view-student-details {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    background: white !important;
                    color: black !important;
                    box-shadow: none !important;
                }
                #btn-print-student-details, #btn-back-to-students {
                    display: none;
                }
                .status-badge {
                    border: 1px solid #000;
                    color: #000 !important;
                    background: none !important;
                }
            }
        `;
        document.head.appendChild(style);
        
        window.print();
        
        // Remove print styles after printing
        setTimeout(() => {
            document.getElementById('print-styles').remove();
        }, 1000);
    });

    // Fetch and render reports
    async function fetchReports() {
        try {
            const res = await adminFetch('/api/admin/analytics'); // Reuse analytics to get payments
            const data = await res.json();
            
            const reportsTableBody = document.getElementById('reports-table-body');
            reportsTableBody.innerHTML = '';
            
            if (data.payments && data.payments.length > 0) {
                data.payments.forEach(p => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${p.student.name}</td>
                        <td>${p.paymentCategory.title}</td>
                        <td>₦${p.amountPaid.toLocaleString()}</td>
                        <td>${new Date(p.paidAt).toLocaleDateString()}</td>
                        <td><span class="status-badge status-${p.status}">${p.status}</span></td>
                        <td>
                            <button class="btn btn-primary btn-sm" onclick="showReceipt(${p.id})">Generate Receipt</button>
                        </td>
                    `;
                    reportsTableBody.appendChild(tr);
                });
            } else {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td colspan="6" style="text-align:center;">No payments found</td>`;
                reportsTableBody.appendChild(tr);
            }
        } catch (error) {
            console.error('Error fetching reports:', error);
        }
    }

    // Show Receipt Modal
    const modalReceipt = document.getElementById('modal-receipt');
    
    window.showReceipt = async (paymentId) => {
        try {
            let payment = null;

            const paymentRes = await adminFetch(`/api/admin/payments/${paymentId}`);
            if (paymentRes.ok) {
                payment = await paymentRes.json();
            } else {
                const res = await adminFetch('/api/admin/analytics');
                const data = await res.json();
                payment = data.payments.find(p => p.id === paymentId);
            }
            
            if (!payment) return alert('Payment not found');

            document.getElementById('r-reference').textContent = payment.reference || `#${payment.id}`;
            document.getElementById('r-date').textContent = new Date(payment.paidAt).toLocaleDateString();
            document.getElementById('r-student-name').textContent = payment.student.name;
            document.getElementById('r-category').textContent = payment.paymentCategory.title;
            document.getElementById('r-amount').textContent = `₦${payment.amountPaid.toLocaleString()}`;
            document.getElementById('r-status').textContent = payment.status;
            document.getElementById('r-status').className = `status-badge status-${payment.status}`;

            modalReceipt.style.display = 'flex';
        } catch (error) {
            console.error('Error showing receipt:', error);
        }
    };

    // Close Receipt Modal
    document.getElementById('btn-close-receipt').addEventListener('click', () => {
        modalReceipt.style.display = 'none';
    });

    // Print Receipt
    document.getElementById('btn-print-receipt').addEventListener('click', () => {
        window.print();
    });

    // Open Reset Password Modal
    window.openResetPasswordModal = function(studentId) {
        const student = window.currentStudents.find(s => s.id === studentId);
        if (!student) return alert('Student not found');

        document.getElementById('reset-student-id').value = student.id;
        document.getElementById('reset-student-name').value = student.name;
        document.getElementById('reset-new-password').value = '';
        document.getElementById('reset-confirm-password').value = '';
        
        document.getElementById('modal-reset-password').style.display = 'flex';
    };

    // Close Reset Password Modal
    document.getElementById('btn-close-reset-password').addEventListener('click', () => {
        document.getElementById('modal-reset-password').style.display = 'none';
    });

    // Handle Reset Password Submission
    document.getElementById('form-reset-password').addEventListener('submit', async (e) => {
        e.preventDefault();
        const studentId = document.getElementById('reset-student-id').value;
        const newPassword = document.getElementById('reset-new-password').value;
        const confirmPassword = document.getElementById('reset-confirm-password').value;

        if (newPassword !== confirmPassword) {
            return alert('Passwords do not match!');
        }

        try {
            const res = await adminFetch('/api/admin/reset-student-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId, newPassword })
            });

            if (res.ok) {
                alert('Password reset successful!');
                document.getElementById('modal-reset-password').style.display = 'none';
            } else {
                const data = await res.json();
                alert(`Error: ${data.error || 'Failed to reset password'}`);
            }
        } catch (error) {
            console.error('Error resetting password:', error);
        }
    });

    // Fetch Tickets
    async function fetchTickets() {
        try {
            const status = document.getElementById('filter-ticket-status').value;
            let url = '/api/admin/tickets';
            if (status) {
                url += `?status=${status}`;
            }

            const res = await adminFetch(url);
            const data = await res.json();
            
            const ticketsTableBody = document.getElementById('tickets-table-body');
            ticketsTableBody.innerHTML = '';
            
            if (data && data.length > 0) {
                data.forEach(t => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${new Date(t.createdAt).toLocaleDateString()}</td>
                        <td>${t.student ? t.student.name : 'Unknown'}</td>
                        <td>${t.subject}</td>
                        <td><span class="status-badge status-${t.status}">${t.status}</span></td>
                        <td>
                            <button class="btn btn-secondary btn-sm" onclick="viewTicketMessage(${t.id})">View</button>
                            ${t.status === 'open' ? `<button class="btn btn-primary btn-sm" onclick="resolveTicket(${t.id})">Resolve</button>` : ''}
                        </td>
                    `;
                    ticketsTableBody.appendChild(tr);
                });
            } else {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td colspan="5" style="text-align:center;">No tickets found</td>`;
                ticketsTableBody.appendChild(tr);
            }
        } catch (error) {
            console.error('Error fetching tickets:', error);
        }
    }

    // View Ticket Message
    window.viewTicketMessage = async (id) => {
        const res = await adminFetch('/api/admin/tickets');
        const tickets = await res.json();
        const ticket = tickets.find(t => t.id === id);
        if (ticket) {
            alert(`Student: ${ticket.student ? ticket.student.name : 'Unknown'}\nSubject: ${ticket.subject}\nMessage: ${ticket.message}`);
        }
    };

    // Resolve Ticket
    window.resolveTicket = async (id) => {
        if (!confirm('Are you sure you want to mark this ticket as resolved?')) return;

        const res = await adminFetch(`/api/admin/tickets/${id}/resolve`, {
            method: 'POST'
        });

        if (res.ok) {
            alert('Ticket resolved successfully!');
            fetchTickets();
        } else {
            alert('Error resolving ticket');
        }
    };

    // Apply Ticket Filter
    const btnApplyTicketFilter = document.getElementById('btn-apply-ticket-filter');
    if (btnApplyTicketFilter) {
        btnApplyTicketFilter.addEventListener('click', () => {
            fetchTickets();
        });
    }

    let studentCategories = [];

    // Fetch student categories
    async function fetchStudentCategories() {
        try {
            const res = await adminFetch('/api/admin/student-categories');
            studentCategories = await res.json();
            renderStudentCategories();
            populateDepartmentDropdown();
        } catch (error) {
            console.error('Error fetching student categories:', error);
        }
    }

    // Render student categories in table
    function renderStudentCategories() {
        const scTableBody = document.getElementById('student-categories-table-body');
        if (!scTableBody) return;
        scTableBody.innerHTML = '';
        studentCategories.forEach(cat => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${cat.name}</td>
                <td>${cat.description || 'N/A'}</td>
                <td>${new Date(cat.createdAt).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteStudentCategory(${cat.id})">Delete</button>
                </td>
            `;
            scTableBody.appendChild(tr);
        });
    }

    // Populate Department dropdown
    function populateDepartmentDropdown() {
        const deptDropdown = document.getElementById('department');
        if (!deptDropdown) return;
        
        // Save current value
        const currentVal = deptDropdown.value;
        
        deptDropdown.innerHTML = '<option value="">-- All Departments --</option>';
        studentCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.name;
            option.textContent = cat.name;
            deptDropdown.appendChild(option);
        });
        
        // Restore value if existed
        if (currentVal) {
            deptDropdown.value = currentVal;
        }
    }

    // Add Student Category Modal
    const btnNewSC = document.getElementById('btn-new-student-category');
    const scModal = document.getElementById('modal-student-category');
    const btnCloseSCModal = document.getElementById('btn-close-sc-modal');
    const scForm = document.getElementById('form-student-category');

    if (btnNewSC && scModal && btnCloseSCModal && scForm) {
        btnNewSC.addEventListener('click', () => {
            scForm.reset();
            scModal.style.display = 'flex';
        });

        btnCloseSCModal.addEventListener('click', () => {
            scModal.style.display = 'none';
        });

        scForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = {
                name: document.getElementById('sc-name').value,
                description: document.getElementById('sc-description').value
            };

            const res = await adminFetch('/api/admin/student-categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                scModal.style.display = 'none';
                fetchStudentCategories();
            } else {
                const err = await res.json();
                alert(err.error || 'Error saving student category');
            }
        });
    }

    // Delete student category
    window.deleteStudentCategory = async (id) => {
        if (!confirm('Are you sure you want to delete this student category?')) return;

        const res = await adminFetch(`/api/admin/student-categories/${id}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            fetchStudentCategories();
        } else {
            alert('Error deleting student category');
        }
    };

    // Initial fetch
    fetchCategories();
    fetchStudentCategories();
});

