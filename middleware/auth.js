const jwt = require('jsonwebtoken');

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('JWT_SECRET must be set in .env and should be at least 32 characters long');
    }
    return secret;
}

function signToken(payload) {
    return jwt.sign(payload, getJwtSecret(), { expiresIn: '8h' });
}

function requireAuth(role) {
    return (req, res, next) => {
        try {
            const header = req.get('Authorization') || '';
            const match = header.match(/^Bearer\s+(.+)$/i);

            if (!match) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const payload = jwt.verify(match[1], getJwtSecret());
            if (role && payload.role !== role) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            req.auth = payload;
            next();
        } catch (error) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }
    };
}

module.exports = {
    signToken,
    requireAuth
};
