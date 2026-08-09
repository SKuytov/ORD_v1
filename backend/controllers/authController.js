'use strict';
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

function getClientIp(req) { return req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null; }
function isMissingTokenVersionColumn(error) { return error?.code === 'ER_BAD_FIELD_ERROR' || /token_version/i.test(error?.message || ''); }
async function getAuthUser(id) {
    try {
        const [rows] = await db.query('SELECT id,username,name,email,role,building,active,token_version FROM users WHERE id=?', [id]);
        return { user: rows[0] || null, tokenVersionSupported: true };
    } catch (error) {
        if (!isMissingTokenVersionColumn(error)) throw error;
        const [rows] = await db.query('SELECT id,username,name,email,role,building,active FROM users WHERE id=?', [id]);
        return { user: rows[0] || null, tokenVersionSupported: false };
    }
}
exports.validateCurrentToken = async (req, res, next) => {
    try {
        const { user, tokenVersionSupported } = await getAuthUser(req.user.id);
        if (!user || !user.active) return res.status(401).json({ success:false, message:'Session is no longer valid' });
        // Role/building comparison makes a role change effective immediately even
        // while a deployment has not yet run migration 012.
        if (user.role !== req.user.role || (user.building || null) !== (req.user.building || null)) return res.status(401).json({success:false,message:'Session is no longer valid'});
        if (tokenVersionSupported && Number(req.user.tokenVersion) !== Number(user.token_version || 0)) return res.status(401).json({success:false,message:'Session is no longer valid'});
        req.currentUser = user;
        next();
    } catch (error) {
        console.error('[Auth] token state validation failed:', error);
        res.status(503).json({ success:false, message:'Authentication service unavailable' });
    }
};

exports.login = async (req,res) => {
    try {
        const {username,password}=req.body;
        if (!username || !password) return res.status(400).json({success:false,message:'Username and password required'});
        let lookup;
        try { lookup=await getAuthUserByUsername(username); } catch(error) { throw error; }
        const user=lookup.user;
        if (!user || !user.active || !(await bcrypt.compare(password,user.password_hash))) {
            await db.query(`INSERT INTO user_login_log (user_id,username,name,role,building,success,failure_reason,ip_address,user_agent,logged_at)
                VALUES (?,?,?,?,?,0,?,?,?,NOW())`,[user?.id || null,username,user?.name || null,user?.role || null,user?.building || null,user?'invalid_password':'user_not_found',getClientIp(req),req.headers['user-agent'] || null]).catch(()=>{});
            return res.status(401).json({success:false,message:'Invalid credentials'});
        }
        const token=jwt.sign({id:user.id,username:user.username,name:user.name,email:user.email,role:user.role,building:user.building,tokenVersion:Number(user.token_version || 0)},process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN || '15m'});
        await Promise.all([
            db.query(`INSERT INTO user_login_log (user_id,username,name,role,building,success,ip_address,user_agent,logged_at) VALUES (?,?,?,?,?,1,?,?,NOW())`,[user.id,user.username,user.name,user.role,user.building,getClientIp(req),req.headers['user-agent'] || null]).catch(()=>{}),
            db.query('UPDATE users SET last_login_at=NOW() WHERE id=?',[user.id]).catch(()=>{})
        ]);
        res.json({success:true,token,user:{id:user.id,username:user.username,name:user.name,email:user.email,role:user.role,building:user.building}});
    } catch(error) { console.error('Login error:',error); res.status(500).json({success:false,message:'Login failed'}); }
};
async function getAuthUserByUsername(username) {
    try {
        const [rows]=await db.query('SELECT id,username,password_hash,name,email,role,building,active,token_version FROM users WHERE username=?',[username]);
        return {user:rows[0] || null, tokenVersionSupported:true};
    } catch(error) {
        if (!isMissingTokenVersionColumn(error)) throw error;
        const [rows]=await db.query('SELECT id,username,password_hash,name,email,role,building,active FROM users WHERE username=?',[username]);
        return {user:rows[0] || null, tokenVersionSupported:false};
    }
}
exports.verify=async(req,res)=> { const user=req.currentUser || (await getAuthUser(req.user.id)).user; if(!user) return res.status(404).json({success:false,message:'User not found'}); res.json({success:true,user:{id:user.id,username:user.username,name:user.name,email:user.email,role:user.role,building:user.building}}); };
exports.logout=async(req,res)=> {
    try {
        try { await db.query('UPDATE users SET token_version=token_version+1 WHERE id=?',[req.user.id]); }
        catch(error) { if(!isMissingTokenVersionColumn(error)) throw error; }
        res.json({success:true,message:'Logged out successfully'});
    } catch(error) { console.error('Logout error:',error); res.status(500).json({success:false,message:'Logout failed'}); }
};
