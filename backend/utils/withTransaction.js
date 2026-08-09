'use strict';

/**
 * Execute work in one MySQL transaction and always return the connection to the
 * pool. The callback must throw to abort; this prevents open transactions from
 * being returned to mysql2's pool on early request exits.
 */
async function withTransaction(pool, work) {
    const connection = await pool.getConnection();
    let committed = false;

    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        committed = true;
        return result;
    } catch (error) {
        if (!committed) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                // Preserve the original failure, but leave an actionable server log.
                console.error('[DB] Transaction rollback failed:', rollbackError.message);
            }
        }
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { withTransaction };
