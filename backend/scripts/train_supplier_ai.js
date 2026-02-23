// backend/scripts/train_supplier_ai.js
// Train Supplier Suggestion AI from Historical Excel Data

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Database connection
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
};

async function trainSupplierAI(excelFilePath) {
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        console.log('📊 Reading Excel file:', excelFilePath);
        
        // Read Excel file
        const workbook = xlsx.readFile(excelFilePath);
        
        console.log(`✅ Found ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.join(', ')}\n`);
        
        // Get existing suppliers map
        const [suppliers] = await connection.execute(
            'SELECT id, name FROM suppliers'
        );
        
        const supplierMap = {};
        suppliers.forEach(s => {
            supplierMap[s.name.toLowerCase().trim()] = s.id;
        });
        
        console.log(`📦 Found ${suppliers.length} suppliers in database\n`);
        
        // Get admin user ID (for training data attribution)
        const [adminUsers] = await connection.execute(
            "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
        );
        
        if (adminUsers.length === 0) {
            throw new Error('No admin user found in database');
        }
        
        const adminUserId = adminUsers[0].id;
        
        let totalProcessed = 0;
        let totalSkipped = 0;
        let newSuppliersFound = new Set();
        
        // Process each sheet
        for (const sheetName of workbook.SheetNames) {
            console.log(`\n📄 Processing sheet: ${sheetName}`);
            console.log('='.repeat(60));
            
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet);
            
            console.log(`   Loaded ${data.length} rows`);
            
            let processedCount = 0;
            let skippedCount = 0;
            
            // Process each row
            for (const row of data) {
                // Extract fields - try multiple column name variations
                const itemDescription = 
                    row['Описание артикул'] || 
                    row['Описание'] ||
                    row['Item Description'] || 
                    row['Description'] ||
                    '';
                    
                const supplierName = 
                    row['Доставчик'] || 
                    row['Supplier'] || 
                    '';
                    
                const building = 
                    row['Машина'] || 
                    row['Machine'] ||
                    row['Building'] || 
                    '';
                
                const status = 
                    row['Статус'] ||
                    row['Status'] || 
                    '';
                
                // Skip rows without item description or supplier
                if (!itemDescription || !supplierName || supplierName.trim() === '') {
                    skippedCount++;
                    continue;
                }
                
                // Skip if item is too short (probably header row)
                if (itemDescription.trim().length < 3) {
                    skippedCount++;
                    continue;
                }
                
                // Find supplier ID (case-insensitive match)
                const supplierKey = supplierName.toLowerCase().trim();
                let supplierId = supplierMap[supplierKey];
                
                // If supplier not found, track it
                if (!supplierId) {
                    newSuppliersFound.add(supplierName.trim());
                    skippedCount++;
                    continue;
                }
                
                // Create a virtual order for training
                // Insert into orders table
                const [orderResult] = await connection.execute(
                    `INSERT INTO orders (
                        item_description, 
                        building, 
                        quantity, 
                        date_needed, 
                        status, 
                        requester_id, 
                        supplier_id,
                        created_at
                    ) VALUES (?, ?, ?, NOW(), ?, ?, ?, NOW())`,
                    [
                        itemDescription.trim(),
                        building || 'Historical Data',
                        1,
                        'Delivered', // Mark as delivered for training
                        adminUserId,
                        supplierId
                    ]
                );
                
                const orderId = orderResult.insertId;
                
                // Log supplier selection for training
                await connection.execute(
                    `INSERT INTO supplier_selection_log (
                        order_id, 
                        supplier_id, 
                        selected_by_user_id, 
                        from_suggestion,
                        selected_at
                    ) VALUES (?, ?, ?, ?, NOW())`,
                    [orderId, supplierId, adminUserId, false]
                );
                
                processedCount++;
                
                if (processedCount % 50 === 0) {
                    process.stdout.write(`   ⏳ Processed ${processedCount}...\r`);
                }
            }
            
            console.log(`   ✅ Processed: ${processedCount} orders`);
            console.log(`   ⏭️  Skipped: ${skippedCount} rows`);
            
            totalProcessed += processedCount;
            totalSkipped += skippedCount;
        }
        
        // Update supplier statistics
        console.log('\n📊 Updating supplier statistics...');
        
        await connection.execute(`
            UPDATE suppliers s
            SET 
                total_orders = (
                    SELECT COUNT(*) FROM orders o WHERE o.supplier_id = s.id
                ),
                last_order_date = (
                    SELECT MAX(created_at) FROM orders o WHERE o.supplier_id = s.id
                )
        `);
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Training Complete!');
        console.log('='.repeat(60));
        console.log(`📈 Total Processed: ${totalProcessed} orders`);
        console.log(`⏭️  Total Skipped: ${totalSkipped} rows (missing data)`);
        
        if (newSuppliersFound.size > 0) {
            const newSuppliers = Array.from(newSuppliersFound);
            console.log(`\n⚠️  Found ${newSuppliers.length} suppliers not in database:`);
            newSuppliers.slice(0, 15).forEach(name => {
                console.log(`   - ${name}`);
            });
            if (newSuppliers.length > 15) {
                console.log(`   ... and ${newSuppliers.length - 15} more`);
            }
            console.log('\n💡 Add these suppliers to your database first, then re-run training.');
            console.log('   You can add them via the Suppliers page in the UI.');
        }
        
    } catch (error) {
        console.error('❌ Training failed:', error);
        throw error;
    } finally {
        await connection.end();
    }
}

// CLI execution
if (require.main === module) {
    const excelFile = process.argv[2];
    
    if (!excelFile) {
        console.error('❌ Usage: node train_supplier_ai.js <path_to_excel_file>');
        console.error('   Example: node train_supplier_ai.js ./data/for_Training_Porachki.xlsx');
        process.exit(1);
    }
    
    if (!fs.existsSync(excelFile)) {
        console.error(`❌ File not found: ${excelFile}`);
        process.exit(1);
    }
    
    trainSupplierAI(excelFile)
        .then(() => {
            console.log('\n🎉 AI training completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Training failed:', error.message);
            process.exit(1);
        });
}

module.exports = { trainSupplierAI };
