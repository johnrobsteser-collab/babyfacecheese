/**
 * Fast Server Startup Script
 * Ensures server starts listening immediately, blockchain initializes in background
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY || '154db3748b7be24621d9f6a8e90619e150f865de65d72e979fbcbe37876afbf8';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API Key middleware
const authenticateAPI = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    // Health check doesn't need API key
    if (req.path === '/api/health') {
        return next();
    }

    if (apiKey === API_KEY) {
        next();
    } else {
        res.status(401).json({
            success: false,
            error: 'Invalid or missing API key. Include x-api-key header or apiKey query parameter.'
        });
    }
};

app.use('/api', authenticateAPI);

// Initialize blockchain (will be loaded later)
let blockchain = null;
let blockchainReady = false;
let blockchainError = null;

// Health check - MUST work immediately
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: blockchainReady ? 'ok' : (blockchainError ? 'error' : 'initializing'),
        timestamp: Date.now(),
        chainLength: blockchain?.chain?.length || 0,
        pendingTransactions: blockchain?.pendingTransactions?.length || 0,
        version: '1.0.0',
        name: 'CHEESE Blockchain',
        ready: blockchainReady,
        error: blockchainError || null
    });
});

// Start server IMMEDIATELY (before blockchain initialization)
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🧀 CHEESE Blockchain Server running on port ${PORT}`);
    console.log(`📡 API available at: http://0.0.0.0:${PORT}/api`);
    console.log(`✅ Server is ready to accept connections`);
    console.log(`⏳ Blockchain initialization starting in background...`);
});

// Now initialize blockchain in background (non-blocking)
setImmediate(async () => {
    try {
        const EnhancedHybridBlockchainAI = require('./hybrid-blockchain-enhanced-fixed');

        console.log('🔄 Initializing CHEESE Blockchain...');
        blockchain = new EnhancedHybridBlockchainAI({
            dbPath: './cheese-blockchain.db',
            miningReward: 100,
            difficulty: 2
        });

        // Initialize with timeout
        const initPromise = blockchain.initialize();
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Initialization timeout after 90 seconds')), 90000)
        );

        await Promise.race([initPromise, timeoutPromise]);
        blockchainReady = true;
        blockchainError = null;
        console.log('✅ CHEESE Blockchain initialized successfully!');
        console.log(`📊 Chain length: ${blockchain.chain.length}`);
        console.log(`⏰ Genesis block timestamp: ${blockchain.chain[0]?.timestamp || 'N/A'}`);

        // Now load the full API routes
        require('./blockchain-server-routes')(app, blockchain, () => blockchainReady);
    } catch (error) {
        console.error('❌ Failed to initialize blockchain:', error);
        console.error('❌ Error stack:', error.stack);
        blockchainError = error.message;
        blockchainReady = false;
    }
});

// Handle server errors
server.on('error', (error) => {
    console.error('❌ Server error:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        if (blockchain && blockchain.close) {
            blockchain.close().then(() => {
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
});



