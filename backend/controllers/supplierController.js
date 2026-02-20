// backend/controllers/supplierController.js
const db = require('../config/database');

exports.getSuppliers = async (req, res) => {
    try {
        const [suppliers] = await db.query(
            'SELECT * FROM suppliers WHERE active = 1 ORDER BY name ASC'
        );
        res.json({ success: true, suppliers });
    } catch (error) {
        console.error('Get suppliers error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve suppliers' });
    }
};

exports.createSupplier = async (req, res) => {
    try {
        const { name, contact_person, email, phone, address, website, notes } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Supplier name is required' });
        }

        const [result] = await db.query(
            `INSERT INTO suppliers (name, contact_person, email, phone, address, website, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, contact_person, email, phone, address, website, notes]
        );

        res.status(201).json({
            success: true,
            message: 'Supplier created successfully',
            supplierId: result.insertId
        });
    } catch (error) {
        console.error('Create supplier error:', error);
        res.status(500).json({ success: false, message: 'Failed to create supplier' });
    }
};

exports.updateSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, contact_person, email, phone, address, website, notes, active } = req.body;

        const updateFields = [];
        const values = [];

        if (name !== undefined) { updateFields.push('name = ?'); values.push(name); }
        if (contact_person !== undefined) { updateFields.push('contact_person = ?'); values.push(contact_person); }
        if (email !== undefined) { updateFields.push('email = ?'); values.push(email); }
        if (phone !== undefined) { updateFields.push('phone = ?'); values.push(phone); }
        if (address !== undefined) { updateFields.push('address = ?'); values.push(address); }
        if (website !== undefined) { updateFields.push('website = ?'); values.push(website); }
        if (notes !== undefined) { updateFields.push('notes = ?'); values.push(notes); }
        if (active !== undefined) { updateFields.push('active = ?'); values.push(active); }

        if (updateFields.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        values.push(id);
        await db.query(
            `UPDATE suppliers SET ${updateFields.join(', ')} WHERE id = ?`,
            values
        );

        res.json({ success: true, message: 'Supplier updated successfully' });
    } catch (error) {
        console.error('Update supplier error:', error);
        res.status(500).json({ success: false, message: 'Failed to update supplier' });
    }
};

exports.deleteSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('UPDATE suppliers SET active = 0 WHERE id = ?', [id]);
        res.json({ success: true, message: 'Supplier deactivated successfully' });
    } catch (error) {
        console.error('Delete supplier error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete supplier' });
    }
};
