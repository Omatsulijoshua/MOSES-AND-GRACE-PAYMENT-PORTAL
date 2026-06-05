const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
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

function getAppBaseUrl(req) {
    return (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function getOpayBaseUrl() {
    return (process.env.OPAY_BASE_URL || 'https://testapi.opaycheckout.com').replace(/\/$/, '');
}

async function verifyOpayPayment(reference) {
    const merchantId = process.env.OPAY_MERCHANT_ID;
    const secretKey = process.env.OPAY_SECRET_KEY || process.env.OPAY_PRIVATE_KEY;

    if (!merchantId || !secretKey) {
        throw new Error('OPay merchant ID or secret key is not configured');
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
    if (!opayRes.ok || opayData.code !== '00000') {
        throw new Error(opayData.message || 'Unable to verify OPay payment');
    }

    return opayData.data;
}

async function applyVerifiedPayment(prisma, reference, opayPayment, expectedStudentId) {
    const payment = await prisma.studentPayment.findFirst({
        where: {
            reference,
            ...(expectedStudentId ? { studentId: expectedStudentId } : {})
        },
        include: { paymentCategory: true }
    });

    if (!payment) {
        throw new Error('Local payment record not found for this OPay reference');
    }

    if (payment.status === 'paid' || payment.status === 'partially_paid') {
        return payment;
    }

    const opayStatus = String(opayPayment.status || '').toUpperCase();
    if (opayStatus !== 'SUCCESS') {
        return payment;
    }

    const verifiedAmount = Number(opayPayment.amount && opayPayment.amount.total);
    if (!Number.isFinite(verifiedAmount) || verifiedAmount <= 0) {
        throw new Error('OPay returned an invalid payment amount');
    }

    const newAmountPaid = payment.amountPaid + verifiedAmount;
    const newBalance = Math.max(payment.paymentCategory.amount - newAmountPaid, 0);

    return prisma.studentPayment.update({
        where: { id: payment.id },
        data: {
            amountPaid: newAmountPaid,
            balanceRemaining: newBalance,
            status: newBalance <= 0 ? 'paid' : 'partially_paid',
            paidAt: new Date()
        }
    });
}

router.use((req, res, next) => {
    if (req.path === '/webhook') {
        return next();
    }

    return requireAuth('student')(req, res, next);
});

// GET /api/student/outstanding-fees
router.get('/outstanding-fees', async (req, res) => {
    try {
        const studentId = req.auth.studentId;

        const student = await req.prisma.student.findUnique({
            where: { id: studentId }
        });

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Fetch categories that apply to this student
        // For simplicity, we fetch all active and filter in memory or use complex query
        // Let's use memory for simplicity or a clean query if possible.
        // Prisma query with OR for null or match:
        const categories = await req.prisma.paymentCategory.findMany({
            where: {
                status: 'active',
                academicSession: student.session,
            }
        });

        // Filter in memory for department and level to be safe with Prisma query complexity
        const filteredCategories = categories.filter(cat => {
            const catDept = (cat.department || '').trim().toLowerCase();
            const studentDept = (student.department || '').trim().toLowerCase();
            const catLevel = (cat.level || '').trim().toLowerCase();
            const studentLevel = (student.level || '').trim().toLowerCase();

            const deptMatch = catDept === '' || catDept === studentDept;
            const levelMatch = catLevel === '' || catLevel === studentLevel;
            return deptMatch && levelMatch;
        });

        // Get student's payments
        const payments = await req.prisma.studentPayment.findMany({
            where: {
                studentId,
                reference: { startsWith: 'MIDLEXX-' }
            }
        });

        // Map to show status
        const result = filteredCategories.map(cat => {
            const payment = payments.find(p => p.paymentCategoryId === cat.id);
            return {
                ...cat,
                paymentStatus: payment ? payment.status : 'unpaid',
                amountPaid: payment ? payment.amountPaid : 0,
                balanceRemaining: payment ? payment.balanceRemaining : cat.amount,
                reference: payment ? payment.reference : null
            };
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/student/payment-history
router.get('/payment-history', async (req, res) => {
    try {
        const studentId = req.auth.studentId;

        const payments = await req.prisma.studentPayment.findMany({
            where: {
                studentId,
                reference: { startsWith: 'MIDLEXX-' }
            },
            include: { paymentCategory: true }
        });

        res.json(payments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/student/pay
router.post('/pay', async (req, res) => {
    if (process.env.ENABLE_MANUAL_PAYMENTS !== 'true') {
        return res.status(403).json({
            error: 'Manual payment recording is disabled. Use OPay checkout and verification.'
        });
    }

    try {
        const studentId = req.auth.studentId;
        const { paymentCategoryId, amount } = req.body;
        
        const category = await req.prisma.paymentCategory.findUnique({
            where: { id: parseInt(paymentCategoryId) }
        });

        if (!category) {
            return res.status(404).json({ error: 'Payment category not found' });
        }

        const amountToPay = parseFloat(amount);

        let payment = await req.prisma.studentPayment.findFirst({
            where: {
                studentId,
                paymentCategoryId: parseInt(paymentCategoryId)
            }
        });

        if (payment) {
            const newAmountPaid = payment.amountPaid + amountToPay;
            const newBalance = category.amount - newAmountPaid;
            
            payment = await req.prisma.studentPayment.update({
                where: { id: payment.id },
                data: {
                    amountPaid: newAmountPaid,
                    balanceRemaining: newBalance,
                    status: newBalance <= 0 ? 'paid' : 'partially_paid',
                    paidAt: new Date()
                }
            });
        } else {
            const balance = category.amount - amountToPay;
            payment = await req.prisma.studentPayment.create({
                data: {
                    studentId,
                    paymentCategoryId: parseInt(paymentCategoryId),
                    amountPaid: amountToPay,
                    balanceRemaining: balance,
                    status: balance <= 0 ? 'paid' : 'partially_paid',
                    reference: 'REF-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
                    paidAt: new Date()
                }
            });
        }

        res.json(payment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/student/initialize-payment
router.post('/initialize-payment', async (req, res) => {
    try {
        const studentId = req.auth.studentId;
        const { paymentCategoryId, amount } = req.body;

        if (!paymentCategoryId || !amount) {
            return res.status(400).json({ error: 'paymentCategoryId and amount are required' });
        }

        const merchantId = process.env.OPAY_MERCHANT_ID;
        const publicKey = process.env.OPAY_PUBLIC_KEY;

        if (!publicKey || !merchantId) {
            return res.status(500).json({ error: 'OPay keys not configured' });
        }

        const student = await req.prisma.student.findUnique({
            where: { id: studentId }
        });

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const category = await req.prisma.paymentCategory.findUnique({
            where: { id: parseInt(paymentCategoryId) }
        });

        if (!category) {
            return res.status(404).json({ error: 'Payment category not found' });
        }

        const existingPayment = await req.prisma.studentPayment.findFirst({
            where: {
                studentId,
                paymentCategoryId: parseInt(paymentCategoryId)
            }
        });

        const balanceRemaining = existingPayment ? existingPayment.balanceRemaining : category.amount;
        const amountToPay = Number(amount);

        if (!Number.isFinite(amountToPay) || amountToPay <= 0) {
            return res.status(400).json({ error: 'Enter a valid payment amount' });
        }

        if (amountToPay > balanceRemaining) {
            return res.status(400).json({ error: 'Amount cannot be greater than the outstanding balance' });
        }

        const reference = `MIDLEXX-${Date.now()}-${studentId}-${paymentCategoryId}`;
        const appBaseUrl = getAppBaseUrl(req);

        const payload = {
            country: process.env.OPAY_COUNTRY || "NG",
            reference: reference,
            amount: {
                total: Math.round(amountToPay).toString(),
                currency: "NGN"
            },
            returnUrl: `${appBaseUrl}/student.html?payment=success&reference=${encodeURIComponent(reference)}`,
            callbackUrl: `${appBaseUrl}/api/student/webhook`,
            cancelUrl: `${appBaseUrl}/student.html?payment=failed&reference=${encodeURIComponent(reference)}`,
            evokeOpay: true,
            customerVisitSource: "WEB",
            expireAt: Number(process.env.OPAY_EXPIRE_AT || 300),
            userInfo: {
                userEmail: student.email,
                userId: studentId.toString(),
                userMobile: student.phone || "",
                userName: student.name
            },
            product: {
                name: `Midlexx LLP - ${category.title}`,
                description: `Payment for ${category.title}`
            }
        };

        if (process.env.OPAY_SN) {
            payload.sn = process.env.OPAY_SN;
        }

        try {
            const opayRes = await fetch(`${getOpayBaseUrl()}/api/v1/international/cashier/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${publicKey}`,
                    'MerchantId': merchantId
                },
                body: JSON.stringify(payload)
            });
            
            const opayData = await opayRes.json();
            
            if (opayData && opayData.data && opayData.data.cashierUrl) {
                if (existingPayment) {
                    await req.prisma.studentPayment.update({
                        where: { id: existingPayment.id },
                        data: {
                            status: 'pending',
                            reference
                        }
                    });
                } else {
                    await req.prisma.studentPayment.create({
                        data: {
                            studentId,
                            paymentCategoryId: parseInt(paymentCategoryId),
                            amountPaid: 0,
                            balanceRemaining: category.amount,
                            status: 'pending',
                            reference
                        }
                    });
                }

                return res.json({
                    status: 'success',
                    message: 'Transaction initialized',
                    data: {
                        checkoutUrl: opayData.data.cashierUrl,
                        reference: reference
                    }
                });
            } else {
                console.error("OPay API Error Response:", opayData);
                return res.status(400).json({ 
                    error: opayData.message || 'OPay API did not return a checkout URL',
                    details: opayData
                });
            }
        } catch (apiError) {
            console.error("OPay API Request Failed:", apiError);
            return res.status(500).json({ error: 'Failed to connect to OPay API' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/student/verify-payment
router.get('/verify-payment', async (req, res) => {
    try {
        const { reference } = req.query;
        if (!reference) {
            return res.status(400).json({ error: 'reference is required' });
        }

        const opayPayment = await verifyOpayPayment(reference);
        const payment = await applyVerifiedPayment(req.prisma, reference, opayPayment, req.auth.studentId);

        res.json({
            status: opayPayment.status,
            payment
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/student/webhook
router.post('/webhook', async (req, res) => {
    try {
        const opayPayload = req.body;
        const reference = opayPayload.reference || (opayPayload.payload && opayPayload.payload.reference);

        if (reference) {
            const opayPayment = await verifyOpayPayment(reference);
            await applyVerifiedPayment(req.prisma, reference, opayPayment);
        }
        
        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(200).send('OK');
    }
});

// GET /api/student/profile
router.get('/profile', async (req, res) => {
    try {
        const studentId = req.auth.studentId;
        const student = await req.prisma.student.findUnique({
            where: { id: studentId }
        });
        if (!student) return res.status(404).json({ error: 'Student not found' });
        res.json(student);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/student/profile
router.put('/profile', async (req, res) => {
    try {
        const studentId = req.auth.studentId;
        const { name, email, department, level, session, password } = req.body;
        const data = { name, email, department, level, session };
        
        if (password) {
            data.password = hashPassword(password);
        }

        const student = await req.prisma.student.update({
            where: { id: studentId },
            data: data
        });
        res.json(student);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/student/history
router.get('/history', async (req, res) => {
    try {
        const studentId = req.auth.studentId;
        const payments = await req.prisma.studentPayment.findMany({
            where: {
                studentId,
                reference: { startsWith: 'MIDLEXX-' },
                status: { in: ['paid', 'partially_paid'] }
            },
            include: {
                paymentCategory: true
            },
            orderBy: {
                paidAt: 'desc'
            }
        });
        res.json(payments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/student/student-categories
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

// POST /api/student/tickets
router.post('/tickets', async (req, res) => {
    try {
        const studentId = req.auth.studentId;
        const { subject, message, studentPaymentId } = req.body;
        if (!subject || !message) {
            return res.status(400).json({ error: 'subject and message are required' });
        }

        if (studentPaymentId) {
            const payment = await req.prisma.studentPayment.findFirst({
            where: {
                id: parseInt(studentPaymentId),
                    studentId,
                    reference: { startsWith: 'MIDLEXX-' }
                }
            });

            if (!payment) {
                return res.status(400).json({ error: 'Invalid payment selected for this student' });
            }
        }

        const ticket = await req.prisma.ticket.create({
            data: {
                studentId,
                studentPaymentId: studentPaymentId ? parseInt(studentPaymentId) : null,
                subject,
                message,
                status: 'open'
            }
        });

        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/student/tickets
router.get('/tickets', async (req, res) => {
    try {
        const studentId = req.auth.studentId;

        const tickets = await req.prisma.ticket.findMany({
            where: { studentId },
            include: { payment: { include: { paymentCategory: true } } },
            orderBy: { createdAt: 'desc' }
        });

        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
