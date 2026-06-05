const express = require('express');
const router = express.Router();
const { signToken } = require('../middleware/auth');
const { hashPassword, verifyPassword, needsPasswordUpgrade } = require('../utils/passwords');

// GET /api/auth/student-categories
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

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { name, email, department, level, session, password } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email and password are required' });
        }

        const existing = await req.prisma.student.findUnique({
            where: { email }
        });

        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const student = await req.prisma.student.create({
            data: {
                name,
                email,
                department,
                level,
                session,
                password: hashPassword(password)
            }
        });

        res.json({ message: 'Account created successfully', studentId: student.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const student = await req.prisma.student.findUnique({
            where: { email }
        });

        if (!student || !verifyPassword(password, student.password)) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (needsPasswordUpgrade(student.password)) {
            await req.prisma.student.update({
                where: { id: student.id },
                data: { password: hashPassword(password) }
            });
        }

        const token = signToken({
            role: 'student',
            studentId: student.id,
            email: student.email
        });

        res.json({ message: 'Login successful', token, studentId: student.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/auth/admin-login
router.post('/admin-login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const admin = await req.prisma.admin.findUnique({
            where: { username }
        });

        if (!admin || !verifyPassword(password, admin.password)) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        if (needsPasswordUpgrade(admin.password)) {
            await req.prisma.admin.update({
                where: { id: admin.id },
                data: { password: hashPassword(password) }
            });
        }

        const token = signToken({
            role: 'admin',
            adminId: admin.id,
            username: admin.username
        });

        res.json({ message: 'Login successful', token, role: 'admin' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
