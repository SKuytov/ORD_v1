// database/seed-users.js
// Run this script AFTER npm install to generate real bcrypt hashes
// Usage: cd backend && node ../database/seed-users.js

const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
require('dotenv').config();

const users = [
    { username: 'admin', password: 'Admin123!', name: 'Admin User', email: 'admin@partpulse.eu', role: 'admin', building: null },
    { username: 'procurement1', password: 'Proc123!', name: 'Procurement User 1', email: 'proc1@partpulse.eu', role: 'procurement', building: null },
    { username: 'procurement2', password: 'Proc123!', name: 'Procurement User 2', email: 'proc2@partpulse.eu', role: 'procurement', building: null },
    { username: 'tech.ct', password: 'Tech123!', name: 'CT Head Technician', email: 'tech.ct@partpulse.eu', role: 'requester', building: 'CT' },
    { username: 'tech.cb', password: 'Tech123!', name: 'CB Head Technician', email: 'tech.cb@partpulse.eu', role: 'requester', building: 'CB' },
    { username: 'tech.ww', password: 'Tech123!', name: 'WW Head Technician', email: 'tech.ww@partpulse.eu', role: 'requester', building: 'WW' },
    { username: 'tech.ps', password: 'Tech123!', name: 'PS Head Technician', email: 'tech.ps@partpulse.eu', role: 'requester', building: 'PS' },
    { username: 'tech.lt', password: 'Tech123!', name: 'LT Head Technician', email: 'tech.lt@partpulse.eu', role: 'requester', building: 'LT' }
];

async function seedUsers() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'partpulse_orders'
        });

        console.log('Connected to database');

        // Clear existing users
        await connection.query('DELETE FROM users');
        console.log('Cleared existing users');

        // Insert users with real bcrypt hashes
        for (const user of users) {
            const hash = await bcrypt.hash(user.password, 10);
            await connection.query(
                `INSERT INTO users (username, password_hash, name, email, role, building) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [user.username, hash, user.name, user.email, user.role, user.building]
            );
            console.log(`Created user: ${user.username} (${user.role})`);
        }

        console.log('\n--- All users seeded successfully! ---');
        console.log('\nDefault credentials:');
        console.log('  admin      / Admin123!  (admin)');
        console.log('  procurement1 / Proc123!  (procurement)');
        console.log('  tech.ct    / Tech123!   (requester - CT)');
        console.log('  tech.cb    / Tech123!   (requester - CB)');
        console.log('  tech.ww    / Tech123!   (requester - WW)');
        console.log('  tech.ps    / Tech123!   (requester - PS)');
        console.log('  tech.lt    / Tech123!   (requester - LT)');
        console.log('\n*** CHANGE THESE PASSWORDS IN PRODUCTION! ***\n');

    } catch (error) {
        console.error('Seeding failed:', error.message);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
        process.exit(0);
    }
}

seedUsers();
