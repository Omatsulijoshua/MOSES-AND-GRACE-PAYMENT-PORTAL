const crypto = require('crypto');

function legacySha256(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedPassword) {
    if (!storedPassword) {
        return false;
    }

    if (storedPassword.startsWith('scrypt$')) {
        const [, salt, hash] = storedPassword.split('$');
        if (!salt || !hash) {
            return false;
        }

        const candidate = crypto.scryptSync(password, salt, 64);
        const expected = Buffer.from(hash, 'hex');
        return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
    }

    if (/^[a-f0-9]{64}$/i.test(storedPassword)) {
        return legacySha256(password) === storedPassword;
    }

    return storedPassword === password;
}

function needsPasswordUpgrade(storedPassword) {
    return !storedPassword || !storedPassword.startsWith('scrypt$');
}

module.exports = {
    hashPassword,
    verifyPassword,
    needsPasswordUpgrade
};
