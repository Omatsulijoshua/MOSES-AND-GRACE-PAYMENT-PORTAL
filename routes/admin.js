const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { hashPassword } = require('../utils/passwords');

function sortObject(value) {
    if (Array.isArray(value)) {
        return value.map(sortObject);
    }

    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((sorted, key) => {
            sorted[key] = sortObject(value[key]);
            return sorted;
        }, {});
    }

    return value;
}

function generateOpaySignature(payload, secretKey) {
    const sortedPayload = JSON.stringify(sortObject(payload));
    return crypto.createHmac('sha512', secretKey).update(sortedPayload).digest('hex');
}

function getOpayBaseUrl() {
    return (process.env.OPAY_BASE_URL || 'https://testapi.opaycheckout.com').replace(/\/$/, '');
}

async function fetchOpayPaymentStatus(reference) {
    const merchantId = process.env.OPAY_MERCHANT_ID;
    const secretKey = process.env.OPAY_SECRET_KEY || process.env.OPAY_PRIVATE_KEY;

    if (!merchantId || !secretKey) {
        return {
            checked: false,
            status: 'not_configured',
            message: 'OPay merchant ID or secret key is not configured on the server.'
        };
    }

    const payload = {
        country: process.env.OPAY_COUNTRY || 'NG',
        reference
    };
    const signature = generateOpaySignature(payload, secretKey);

    const opayRes = await fetch(`${getOpayBaseUrl()}/api/v1/international/cashier/status`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${signature}`,
            'MerchantId': merchantId
        },
        body: JSON.stringify(payload)
    });

    const opayData = await opayRes.json();
    return {
        checked: true,
        ok: opayRes.ok && opayData.code === '00000',
        status: opayData.data ? opayData.data.status : 'unknown',
        message: opayData.message || '',
        raw: opayData.data || opayData
    };
}

// GET /api/admin/payment-categories
router.get('/payment-categories', async (req, res) => {
    try {
        const categories = await req.prisma.paymentCategory.findMany();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin/payment-categories
router.post('/payment-categories', async (req, res) => {
    try {
        const data = req.body;
        const category = await req.prisma.paymentCategory.create({
            data: {
                title: data.title,
                description: data.description,
                amount: parseFloat(data.amount),
                paymentType: data.paymentType,
                academicSession: data.academicSession,
                semester: data.semester,
                department: data.department,
                level: data.level,
                isCompulsory: data.isCompulsory === true || data.isCompulsory === 'true',
                dueDate: data.dueDate ? new Date(data.dueDate) : null,
                status: data.status || 'active',
            }
        });
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/admin/payment-categories/:id
router.put('/payment-categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const category = await req.prisma.paymentCategory.update({
            where: { id: parseInt(id) },
            data: {
                title: data.title,
                description: data.description,
                amount: data.amount ? parseFloat(data.amount) : undefined,
                paymentType: data.paymentType,
                academicSession: data.academicSession,
                semester: data.semester,
                department: data.department,
                level: data.level,
                isCompulsory: data.isCompulsory !== undefined ? (data.isCompulsory === true || data.isCompulsory === 'true') : undefined,
                dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
                status: data.status,
            }
        });
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/admin/payment-categories/:id
router.delete('/payment-categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await req.prisma.paymentCategory.delete({
            where: { id: parseInt(id) }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin/analytics
router.get('/analytics', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                paidAt: {
                    gte: new Date(startDate),
                    lte: new Date(endDate)
                }
            };
        } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            dateFilter = {
                paidAt: {
                    gte: today
                }
            };
        }

        // Payments in range (or today if no range)
        const paymentsInRange = await req.prisma.studentPayment.findMany({
            where: {
                ...dateFilter,
                status: 'paid',
                reference: { startsWith: 'MIDLEXX-' }
            },
            include: {
                student: true,
                paymentCategory: true
            },
            orderBy: {
                paidAt: 'desc'
            }
        });

        const totalInRange = paymentsInRange.reduce((sum, p) => sum + p.amountPaid, 0);

        // All received payments (all time)
        const allReceived = await req.prisma.studentPayment.findMany({
            where: {
                status: 'paid',
                reference: { startsWith: 'MIDLEXX-' }
            }
        });
        const totalReceived = allReceived.reduce((sum, p) => sum + p.amountPaid, 0);

        // All pending payments
        const pendingPayments = await req.prisma.studentPayment.findMany({
            where: {
                status: 'pending',
                reference: { startsWith: 'MIDLEXX-' }
            }
        });

        // Total expected revenue
        const students = await req.prisma.student.findMany();
        const categories = await req.prisma.paymentCategory.findMany({
            where: { status: 'active' }
        });

        let totalExpected = 0;
        categories.forEach(cat => {
            const eligibleStudents = students.filter(s => {
                const deptMatch = !cat.department || cat.department === s.department;
                const levelMatch = !cat.level || cat.level === s.level;
                return deptMatch && levelMatch && cat.academicSession === s.session;
            });
            totalExpected += eligibleStudents.length * cat.amount;
        });

        res.json({
            paymentsToday: totalInRange, // Keeps key name for compatibility
            totalReceived: totalReceived,
            pendingPayments: pendingPayments.length,
            totalExpected: totalExpected,
            isFiltered: !!(startDate && endDate),
            payments: paymentsInRange
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin/verify-payment
router.post('/verify-payment', async (req, res) => {
    try {
        const reference = String(req.body.reference || '').trim();
        if (!reference) {
            return res.status(400).json({ error: 'Transaction ID or reference is required' });
        }

        const payment = await req.prisma.studentPayment.findFirst({
            where: { reference },
            include: {
                student: true,
                paymentCategory: true
            }
        });

        const opay = await fetchOpayPaymentStatus(reference);

        if (payment && opay.checked && String(opay.status || '').toUpperCase() === 'SUCCESS' && payment.status === 'pending') {
            const opayAmount = Number(opay.raw && opay.raw.amount && opay.raw.amount.total);
            const amountPaid = Number.isFinite(opayAmount) && opayAmount > 0 ? opayAmount : payment.amountPaid;
            const balanceRemaining = Math.max(payment.paymentCategory.amount - amountPaid, 0);

            const updatedPayment = await req.prisma.studentPayment.update({
                where: { id: payment.id },
                data: {
                    amountPaid,
                    balanceRemaining,
                    status: balanceRemaining <= 0 ? 'paid' : 'partially_paid',
                    paidAt: new Date()
                },
                include: {
                    student: true,
                    paymentCategory: true
                }
            });

            return res.json({
                found: true,
                locallyRecorded: true,
                payment: updatedPayment,
                opay
            });
        }

        res.json({
            found: !!payment,
            locallyRecorded: !!payment,
            payment,
            opay
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin/payments/:id
router.get('/payments/:id', async (req, res) => {
    try {
        const payment = await req.prisma.studentPayment.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                student: true,
                paymentCategory: true
            }
        });

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        res.json(payment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin/students
router.get('/students', async (req, res) => {
    try {
        const students = await req.prisma.student.findMany({
            include: {
                payments: {
                    where: {
                        reference: { startsWith: 'MIDLEXX-' }
                    },
                    include: {
                        paymentCategory: true
                    }
                }
            }
        });
        res.json(students);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin/admins
router.get('/admins', async (req, res) => {
    try {
        const admins = await req.prisma.admin.findMany({
            select: {
                id: true,
                username: true,
                name: true
            }
        });
        res.json(admins);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin/create-admin
router.post('/create-admin', async (req, res) => {
    try {
        const { username, password, name } = req.body;
        const admin = await req.prisma.admin.create({
            data: {
                username,
                password: hashPassword(password),
                name
            }
        });
        res.json({ success: true, admin: { id: admin.id, username: admin.username } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin/change-password
router.post('/change-password', async (req, res) => {
    try {
        const { username, newPassword } = req.body;
        const admin = await req.prisma.admin.update({
            where: { username },
            data: { password: hashPassword(newPassword) }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/reset-student-password', async (req, res) => {
    try {
        const { studentId, newPassword } = req.body;
        
        if (!studentId || !newPassword) {
            return res.status(400).json({ error: 'Student ID and new password are required' });
        }

        const student = await req.prisma.student.update({
            where: { id: parseInt(studentId) },
            data: { password: hashPassword(newPassword) }
        });

        res.json({ success: true, message: 'Password reset successful' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin/tickets
router.get('/tickets', async (req, res) => {
    try {
        const { status } = req.query;
        const where = {};
        if (status) {
            where.status = status;
        }

        const tickets = await req.prisma.ticket.findMany({
            where,
            include: {
                student: true,
                payment: { include: { paymentCategory: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin/tickets/:id/resolve
router.post('/tickets/:id/resolve', async (req, res) => {
    try {
        const { id } = req.params;
        const ticket = await req.prisma.ticket.update({
            where: { id: parseInt(id) },
            data: { status: 'resolved' }
        });

        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin/student-categories
router.get('/student-categories', async (req, res) => {
    try {
        const categories = await req.prisma.studentCategory.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin/student-categories
router.post('/student-categories', async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Name is required' });
        }
        const category = await req.prisma.studentCategory.create({
            data: {
                name: name.trim(),
                description: description ? description.trim() : null
            }
        });
        res.json(category);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'A category with this name already exists' });
        }
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/admin/student-categories/:id
router.delete('/student-categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await req.prisma.studentCategory.delete({
            where: { id: parseInt(id) }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
