// backend/routes/supplier-catalog.js - Supplier Product Catalog Management

const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const multer = require('multer');
const { authenticateToken, requireRole } = require('../middleware/auth');
const pool = require('../db');

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
        }
    }
});

// ===================== GENERATE TEMPLATE =====================

/**
 * GET /api/suppliers/:id/catalog-template
 * Generate and download Excel template for supplier catalog
 * Access: Admin, Procurement
 */
router.get('/:id/catalog-template', authenticateToken, requireRole(['admin', 'procurement']), async (req, res) => {
    const supplierId = parseInt(req.params.id, 10);

    try {
        // Get supplier info
        const supplierResult = await pool.query(
            'SELECT id, name, contact_person, email FROM suppliers WHERE id = $1',
            [supplierId]
        );

        if (supplierResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Supplier not found' });
        }

        const supplier = supplierResult.rows[0];

        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'PartPulse Orders';
        workbook.created = new Date();

        // Instructions sheet
        const instructionsSheet = workbook.addWorksheet('Instructions', {
            properties: { tabColor: { argb: 'FF3B82F6' } }
        });

        instructionsSheet.getColumn(1).width = 80;

        instructionsSheet.addRow(['PartPulse Supplier Product Catalog Template']);
        instructionsSheet.getRow(1).font = { size: 16, bold: true, color: { argb: 'FF1E40AF' } };
        instructionsSheet.addRow([]);

        instructionsSheet.addRow([`Supplier: ${supplier.name}`]);
        instructionsSheet.getRow(3).font = { size: 14, bold: true };
        instructionsSheet.addRow([`Contact: ${supplier.contact_person || 'N/A'} (${supplier.email || 'N/A'})`]);
        instructionsSheet.addRow([]);

        instructionsSheet.addRow(['INSTRUCTIONS:']);
        instructionsSheet.getRow(6).font = { bold: true, size: 12 };
        instructionsSheet.addRow([]);

        const instructions = [
            '1. Fill out the "Product Catalog" sheet with your product information',
            '2. DO NOT modify column headers or sheet names',
            '3. Required fields are marked with * in the column headers',
            '4. Use the dropdown values where provided (Category, Stock Status)',
            '5. Brand Name is important for AI training - please provide accurate brand information',
            '6. Keywords help with search - use comma-separated terms',
            '7. Save the file and upload it back to PartPulse',
            '8. If you have questions, contact your PartPulse administrator',
            '',
            'COLUMN DESCRIPTIONS:',
            '',
            '• Category* - Product category (Bearings, Motors, Sensors, etc.)',
            '• Part Number* - Your internal part/SKU number',
            '• Description* - Detailed product description',
            '• Manufacturer - Original equipment manufacturer (if applicable)',
            '• Brand Name* - Brand/trademark name (helps AI suggest your products)',
            '• Unit Price* - Price per unit (numbers only)',
            '• Currency - EUR, USD, BGN, etc.',
            '• Lead Time (days)* - Delivery time in days',
            '• Min Order Qty - Minimum order quantity (default: 1)',
            '• Stock Status* - In Stock / Made to Order / Special Order',
            '• Product Image URL - Link to product image (optional)',
            '• Datasheet URL - Link to technical datasheet (optional)',
            '• Keywords - Comma-separated search terms (bearing, ball, 6205, SKF, etc.)'
        ];

        instructions.forEach(instruction => {
            instructionsSheet.addRow([instruction]);
        });

        // Product Catalog sheet
        const catalogSheet = workbook.addWorksheet('Product Catalog', {
            properties: { tabColor: { argb: 'FF10B981' } }
        });

        // Define columns
        catalogSheet.columns = [
            { header: 'Category *', key: 'category', width: 20 },
            { header: 'Part Number *', key: 'part_number', width: 20 },
            { header: 'Description *', key: 'description', width: 40 },
            { header: 'Manufacturer', key: 'manufacturer', width: 20 },
            { header: 'Brand Name *', key: 'brand_name', width: 20 },
            { header: 'Unit Price *', key: 'unit_price', width: 15 },
            { header: 'Currency', key: 'currency', width: 10 },
            { header: 'Lead Time (days) *', key: 'lead_time_days', width: 18 },
            { header: 'Min Order Qty', key: 'min_order_qty', width: 15 },
            { header: 'Stock Status *', key: 'stock_status', width: 18 },
            { header: 'Product Image URL', key: 'image_url', width: 30 },
            { header: 'Datasheet URL', key: 'datasheet_url', width: 30 },
            { header: 'Keywords', key: 'keywords', width: 40 }
        ];

        // Style header row
        const headerRow = catalogSheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF3B82F6' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 20;

        // Add example row
        catalogSheet.addRow({
            category: 'Bearings',
            part_number: 'BRG-6205-2RS',
            description: 'Deep groove ball bearing 6205 2RS, sealed both sides',
            manufacturer: 'SKF',
            brand_name: 'SKF',
            unit_price: 12.50,
            currency: 'EUR',
            lead_time_days: 5,
            min_order_qty: 1,
            stock_status: 'In Stock',
            image_url: 'https://example.com/images/6205.jpg',
            datasheet_url: 'https://example.com/datasheets/6205.pdf',
            keywords: 'bearing, ball bearing, 6205, sealed, SKF'
        });

        // Style example row
        const exampleRow = catalogSheet.getRow(2);
        exampleRow.font = { italic: true, color: { argb: 'FF6B7280' } };

        // Add data validation dropdowns
        const categories = ['Bearings', 'Motors', 'Sensors', 'Pneumatics', 'Hydraulics', 'Electrical', 'Mechanical', 'Tools', 'Consumables', 'Other'];
        const stockStatuses = ['In Stock', 'Made to Order', 'Special Order'];

        // Apply validation to 1000 rows (more than enough)
        for (let i = 3; i <= 1000; i++) {
            // Category dropdown
            catalogSheet.getCell(`A${i}`).dataValidation = {
                type: 'list',
                allowBlank: false,
                formulae: [`"${categories.join(',')}"`]
            };

            // Stock Status dropdown
            catalogSheet.getCell(`J${i}`).dataValidation = {
                type: 'list',
                allowBlank: false,
                formulae: [`"${stockStatuses.join(',')}"`]
            };

            // Unit Price - number validation
            catalogSheet.getCell(`F${i}`).dataValidation = {
                type: 'decimal',
                operator: 'greaterThan',
                formulae: [0],
                showErrorMessage: true,
                errorTitle: 'Invalid Price',
                error: 'Price must be a positive number'
            };

            // Lead Time - integer validation
            catalogSheet.getCell(`H${i}`).dataValidation = {
                type: 'whole',
                operator: 'greaterThan',
                formulae: [0],
                showErrorMessage: true,
                errorTitle: 'Invalid Lead Time',
                error: 'Lead time must be a positive integer'
            };
        }

        // Freeze header row
        catalogSheet.views = [
            { state: 'frozen', xSplit: 0, ySplit: 1 }
        ];

        // Generate filename
        const filename = `PartPulse_Catalog_${supplier.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Write to response
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error generating catalog template:', error);
        res.status(500).json({ success: false, message: 'Failed to generate template' });
    }
});

// ===================== UPLOAD CATALOG =====================

/**
 * POST /api/suppliers/:id/catalog-upload
 * Upload and parse supplier catalog Excel file
 * Access: Admin, Procurement
 */
router.post('/:id/catalog-upload', authenticateToken, requireRole(['admin', 'procurement']), upload.single('catalog'), async (req, res) => {
    const supplierId = parseInt(req.params.id, 10);
    const replaceExisting = req.body.replaceExisting === 'true';

    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    try {
        // Verify supplier exists
        const supplierResult = await pool.query('SELECT id, name FROM suppliers WHERE id = $1', [supplierId]);
        if (supplierResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Supplier not found' });
        }

        // Parse Excel file
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);

        const catalogSheet = workbook.getWorksheet('Product Catalog');
        if (!catalogSheet) {
            return res.status(400).json({ success: false, message: 'Invalid template: "Product Catalog" sheet not found' });
        }

        const products = [];
        const errors = [];
        let rowIndex = 0;

        catalogSheet.eachRow((row, rowNumber) => {
            // Skip header row and example row
            if (rowNumber <= 2) return;

            rowIndex++;

            const category = row.getCell(1).value;
            const partNumber = row.getCell(2).value;
            const description = row.getCell(3).value;
            const manufacturer = row.getCell(4).value;
            const brandName = row.getCell(5).value;
            const unitPrice = row.getCell(6).value;
            const currency = row.getCell(7).value || 'EUR';
            const leadTimeDays = row.getCell(8).value;
            const minOrderQty = row.getCell(9).value || 1;
            const stockStatus = row.getCell(10).value;
            const imageUrl = row.getCell(11).value;
            const datasheetUrl = row.getCell(12).value;
            const keywords = row.getCell(13).value;

            // Skip empty rows
            if (!category && !partNumber && !description) return;

            // Validate required fields
            if (!category || !partNumber || !description || !brandName || !unitPrice || !leadTimeDays || !stockStatus) {
                errors.push(`Row ${rowNumber}: Missing required fields`);
                return;
            }

            // Validate data types
            if (isNaN(parseFloat(unitPrice)) || parseFloat(unitPrice) <= 0) {
                errors.push(`Row ${rowNumber}: Invalid unit price`);
                return;
            }

            if (isNaN(parseInt(leadTimeDays, 10)) || parseInt(leadTimeDays, 10) <= 0) {
                errors.push(`Row ${rowNumber}: Invalid lead time`);
                return;
            }

            products.push({
                category: String(category).trim(),
                partNumber: String(partNumber).trim(),
                description: String(description).trim(),
                manufacturer: manufacturer ? String(manufacturer).trim() : null,
                brandName: String(brandName).trim(),
                unitPrice: parseFloat(unitPrice),
                currency: String(currency).trim(),
                leadTimeDays: parseInt(leadTimeDays, 10),
                minOrderQty: parseInt(minOrderQty, 10) || 1,
                stockStatus: String(stockStatus).trim(),
                imageUrl: imageUrl ? String(imageUrl).trim() : null,
                datasheetUrl: datasheetUrl ? String(datasheetUrl).trim() : null,
                keywords: keywords ? String(keywords).trim() : null
            });
        });

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors found',
                errors: errors
            });
        }

        if (products.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid products found in the file'
            });
        }

        // Begin transaction
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // If replace existing, delete old products
            if (replaceExisting) {
                await client.query('DELETE FROM supplier_products WHERE supplier_id = $1', [supplierId]);
            }

            // Insert products
            let insertedCount = 0;
            let updatedCount = 0;

            for (const product of products) {
                // Check if product exists (by supplier_id and part_number)
                const existingResult = await client.query(
                    'SELECT id FROM supplier_products WHERE supplier_id = $1 AND part_number = $2',
                    [supplierId, product.partNumber]
                );

                if (existingResult.rows.length > 0) {
                    // Update existing product
                    await client.query(
                        `UPDATE supplier_products SET
                            category = $1, description = $2, manufacturer = $3,
                            brand_name = $4, unit_price = $5, currency = $6,
                            lead_time_days = $7, min_order_qty = $8, stock_status = $9,
                            image_url = $10, datasheet_url = $11, keywords = $12,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE supplier_id = $13 AND part_number = $14`,
                        [
                            product.category, product.description, product.manufacturer,
                            product.brandName, product.unitPrice, product.currency,
                            product.leadTimeDays, product.minOrderQty, product.stockStatus,
                            product.imageUrl, product.datasheetUrl, product.keywords,
                            supplierId, product.partNumber
                        ]
                    );
                    updatedCount++;
                } else {
                    // Insert new product
                    await client.query(
                        `INSERT INTO supplier_products (
                            supplier_id, category, part_number, description, manufacturer,
                            brand_name, unit_price, currency, lead_time_days, min_order_qty,
                            stock_status, image_url, datasheet_url, keywords
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                        [
                            supplierId, product.category, product.partNumber, product.description,
                            product.manufacturer, product.brandName, product.unitPrice,
                            product.currency, product.leadTimeDays, product.minOrderQty,
                            product.stockStatus, product.imageUrl, product.datasheetUrl,
                            product.keywords
                        ]
                    );
                    insertedCount++;
                }
            }

            await client.query('COMMIT');

            res.json({
                success: true,
                message: 'Catalog uploaded successfully',
                inserted: insertedCount,
                updated: updatedCount,
                total: products.length
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Error uploading catalog:', error);
        res.status(500).json({ success: false, message: 'Failed to upload catalog' });
    }
});

// ===================== GET SUPPLIER PRODUCTS =====================

/**
 * GET /api/suppliers/:id/products
 * Get all products for a supplier
 * Access: Admin, Procurement, Manager
 */
router.get('/:id/products', authenticateToken, requireRole(['admin', 'procurement', 'manager']), async (req, res) => {
    const supplierId = parseInt(req.params.id, 10);
    const category = req.query.category;
    const search = req.query.search;

    try {
        let query = `
            SELECT 
                sp.*,
                s.name as supplier_name
            FROM supplier_products sp
            JOIN suppliers s ON sp.supplier_id = s.id
            WHERE sp.supplier_id = $1
        `;
        const params = [supplierId];

        if (category) {
            params.push(category);
            query += ` AND sp.category = $${params.length}`;
        }

        if (search) {
            params.push(`%${search}%`);
            query += ` AND (
                sp.description ILIKE $${params.length} OR
                sp.part_number ILIKE $${params.length} OR
                sp.brand_name ILIKE $${params.length} OR
                sp.keywords ILIKE $${params.length}
            )`;
        }

        query += ' ORDER BY sp.category, sp.part_number';

        const result = await pool.query(query, params);

        res.json({
            success: true,
            products: result.rows
        });

    } catch (error) {
        console.error('Error fetching supplier products:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch products' });
    }
});

// ===================== SEARCH ALL PRODUCTS =====================

/**
 * GET /api/suppliers/products/search
 * Search products across all suppliers
 * Access: Admin, Procurement, Manager
 */
router.get('/products/search', authenticateToken, requireRole(['admin', 'procurement', 'manager']), async (req, res) => {
    const search = req.query.q;
    const category = req.query.category;

    if (!search || search.trim().length < 2) {
        return res.status(400).json({ success: false, message: 'Search term must be at least 2 characters' });
    }

    try {
        let query = `
            SELECT 
                sp.*,
                s.name as supplier_name,
                s.email as supplier_email,
                s.phone as supplier_phone
            FROM supplier_products sp
            JOIN suppliers s ON sp.supplier_id = s.id
            WHERE s.is_active = true AND (
                sp.description ILIKE $1 OR
                sp.part_number ILIKE $1 OR
                sp.brand_name ILIKE $1 OR
                sp.keywords ILIKE $1 OR
                sp.manufacturer ILIKE $1
            )
        `;
        const params = [`%${search}%`];

        if (category) {
            params.push(category);
            query += ` AND sp.category = $${params.length}`;
        }

        query += ' ORDER BY sp.brand_name, sp.part_number LIMIT 100';

        const result = await pool.query(query, params);

        res.json({
            success: true,
            products: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('Error searching products:', error);
        res.status(500).json({ success: false, message: 'Failed to search products' });
    }
});

// ===================== GET CATALOG STATISTICS =====================

/**
 * GET /api/suppliers/:id/catalog-stats
 * Get statistics about supplier catalog
 * Access: Admin, Procurement
 */
router.get('/:id/catalog-stats', authenticateToken, requireRole(['admin', 'procurement']), async (req, res) => {
    const supplierId = parseInt(req.params.id, 10);

    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total_products,
                COUNT(DISTINCT category) as total_categories,
                COUNT(DISTINCT brand_name) as total_brands,
                AVG(unit_price) as avg_price,
                AVG(lead_time_days) as avg_lead_time,
                MAX(updated_at) as last_updated
            FROM supplier_products
            WHERE supplier_id = $1
        `, [supplierId]);

        const categoryBreakdown = await pool.query(`
            SELECT category, COUNT(*) as count
            FROM supplier_products
            WHERE supplier_id = $1
            GROUP BY category
            ORDER BY count DESC
        `, [supplierId]);

        res.json({
            success: true,
            stats: result.rows[0],
            categoryBreakdown: categoryBreakdown.rows
        });

    } catch (error) {
        console.error('Error fetching catalog stats:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
    }
});

module.exports = router;
