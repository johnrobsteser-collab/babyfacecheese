/**
 * 🧀 CHEESE BLOCKCHAIN SERVER
 * Complete blockchain API server using hybrid-blockchain-enhanced.js
 * Handles signature-based transactions (client-side signing)
 * 
 * NOTE: DEX is now a separate project in the /DEX folder
 */

// CRITICAL: Set Firestore credentials BEFORE any imports
// This ensures the credentials are available when @google-cloud/firestore initializes
// LOCAL DEV: Set path to local service account file
// Using path.resolve to handle Windows paths correctly
const path = require('path');
const fs = require('fs');
// Check for local service account first (Railway Deployment)
const localCreds = path.resolve(__dirname, './service-account.json');
if (fs.existsSync(localCreds)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = localCreds;
    console.log('🔑 Loaded credentials from local file');
} else if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, '../CLEAN DEX Cloud/firebase-service-account.json');
    console.log('🔑 Set dev credentials path');
}

const express = require('express');
const cors = require('cors');
// Initialize Blockchain
const EnhancedHybridBlockchainAI = require('./hybrid-blockchain-enhanced-fixed');
let blockchain = null; // Will be initialized in server start

const CheeseAIEngine = require('./ai-engine');
const GuardianAI = require('./guardian-ai-ml'); // ML-Powered Guardian AI

const app = express();
const PORT = process.env.PORT || 3000;

// SECURITY: API Key PERMANENTLY HARDCODED
// This NEVER changes regardless of environment variables
// FIXED: Removed env var dependency to prevent recurring issues
const API_KEY = '154db3748b7be24621d9f6a8e90619e150f865de65d72e979fbcbe37876afbf8';

// AI Engine instance
let aiEngine = null;

// Guardian AI instance for user protection
let guardianAI = null;

// FEATURE FLAGS - Set to true to enable new features
const ENABLE_ENTERPRISE_P2P = process.env.ENABLE_LIBP2P === 'true' || false;
const ENABLE_REAL_AI = process.env.ENABLE_REAL_AI === 'true' || false;

// New enterprise features (optional, backwards compatible)
let enterpriseP2P = null;
let fraudDetectorNN = null;

if (ENABLE_ENTERPRISE_P2P) {
    try {
        // Use advanced P2P integration (recommended)
        const P2PIntegration = require('./advanced-p2p/p2p-integration');
        console.log('✅ Advanced P2P Integration module loaded (697-line NetworkManager)');
    } catch (error) {
        // Fallback to basic P2P
        try {
            const EnterpriseP2PNetwork = require('./p2p-enterprise');
            console.log('⚠️ Using basic P2P (advanced not available):', error.message);
        } catch (e2) {
            console.log('⚠️ No P2P module available:', e2.message);
        }
    }
}

if (ENABLE_REAL_AI) {
    try {
        const FraudDetectorNN = require('./ai-models/fraud-detector-nn');
        fraudDetectorNN = new FraudDetectorNN();
        console.log('✅ Real AI neural network loaded');
    } catch (error) {
        console.log('⚠️ Real AI not available:', error.message);
    }
}


// Middleware - SECURE CORS configuration
const corsOptions = {
    origin: [
        'https://cheese-tree-network.web.app',
        'https://cheese-tree-network.firebaseapp.com',
        'https://cheese-blockchain.web.app',
        'https://cheese-blockchain.firebaseapp.com',
        'http://localhost:3000',  // Local development
        'http://localhost:5000'   // Local testing
    ],
    methods: ['GET', 'POST'],
    credentials: true,
    maxAge: 86400  // 24 hours
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));  // Reduced from 10mb
app.use(express.urlencoded({ extended: true }));

// Root route - show API welcome page (BEFORE static middleware!)
app.get('/', (req, res) => {
    res.json({
        name: 'CHEESE Blockchain API',
        version: '2.0.0',
        status: 'online',
        description: 'Native CHEESE blockchain API server',
        endpoints: {
            health: '/api/health',
            balance: '/api/balance/:address',
            blockchain: '/api/blockchain',
            transaction: '/api/transaction (POST)',
            mining: '/api/mine',
            ai: '/api/ai/status'
        },
        documentation: 'https://cheese-tree-network.web.app/whitepaper',
        wallet: 'https://cheese-tree-network.web.app',
        dex: 'https://cheese-tree-network.web.app/dex',
        timestamp: new Date().toISOString()
    });
});

// Serve static files for Wallet UI (excluding root path which is handled above)
app.use(express.static(__dirname, { index: false }));

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

// SECURITY: Rate limiting to prevent DDoS
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply to all /api routes
app.use('/api', apiLimiter);

app.use('/api', authenticateAPI);

// Initialize blockchain
// Blockchain variable already initialized at top of file
let blockchainReady = false;
let blockchainError = null;

// ==================== HEALTH CHECK ====================
// CRITICAL: This endpoint must work immediately for health checks
app.get('/api/health', (req, res) => {
    // Always return 200 - server is running
    // Status indicates blockchain initialization state
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

// ==================== AI ENGINE ENDPOINTS ====================
// The 5 Core AI Features API

// AI Status - Overview of all AI features
app.get('/api/ai/status', (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({
            success: false,
            error: 'AI Engine not initialized'
        });
    }
    res.json({
        success: true,
        ai: aiEngine.getStatus()
    });
});

// AI Analytics - Comprehensive network analytics
app.get('/api/ai/analytics', (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({
            success: false,
            error: 'AI Engine not initialized'
        });
    }
    res.json({
        success: true,
        analytics: aiEngine.getAnalytics()
    });
});

// ML Transaction Validator - Fraud detection for transaction
app.get('/api/ai/fraud/:txid', async (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({
            success: false,
            error: 'AI Engine not initialized'
        });
    }

    try {
        const { txid } = req.params;
        // Create a mock transaction for analysis
        const transaction = {
            id: txid,
            amount: parseFloat(req.query.amount) || 100,
            from: req.query.from || '0x0000000000000000000000000000000000000000',
            to: req.query.to || '0x0000000000000000000000000000000000000000',
            timestamp: Date.now()
        };

        const fraudScore = await aiEngine.calculateFraudScore(transaction);

        res.json({
            success: true,
            analysis: {
                transactionId: txid,
                fraudScore: parseFloat(fraudScore.toFixed(3)),
                riskLevel: fraudScore > 0.7 ? 'high' : fraudScore > 0.4 ? 'medium' : 'low',
                recommendation: fraudScore > 0.6 ? 'Review manually' : 'Auto-approve',
                modelType: 'ml_fraud_detector',
                analyzedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Wallet Risk Analysis
app.get('/api/ai/risk/:address', async (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({
            success: false,
            error: 'AI Engine not initialized'
        });
    }

    try {
        const { address } = req.params;
        const riskAnalysis = await aiEngine.analyzeWalletRisk(address);

        res.json({
            success: true,
            analysis: riskAnalysis
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ML Predictive Analytics - Price prediction
app.get('/api/ai/predict/price', (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({
            success: false,
            error: 'AI Engine not initialized'
        });
    }

    const currentPrice = parseFloat(req.query.current) || 1.0;
    const prediction = aiEngine.predictPrice(currentPrice);

    res.json({
        success: true,
        prediction
    });
});

// ML Predictive Analytics - Volume prediction
app.get('/api/ai/predict/volume', (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({
            success: false,
            error: 'AI Engine not initialized'
        });
    }

    const prediction = aiEngine.predictVolume();

    res.json({
        success: true,
        prediction
    });
});

// ML Mining Optimizer - Get optimal difficulty
app.get('/api/ai/mining/optimize', (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({
            success: false,
            error: 'AI Engine not initialized'
        });
    }

    const currentDifficulty = parseInt(req.query.current) || 4;
    const optimization = aiEngine.getOptimalDifficulty(currentDifficulty);

    res.json({
        success: true,
        optimization
    });
});

// Network Health Analysis
app.get('/api/ai/network/health', (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({
            success: false,
            error: 'AI Engine not initialized'
        });
    }

    const health = aiEngine.getNetworkHealth();

    res.json({
        success: true,
        health
    });
});

// Autonomous Optimizer - Get recommendations
app.get('/api/ai/recommendations', (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({
            success: false,
            error: 'AI Engine not initialized'
        });
    }

    const recommendations = aiEngine.getNetworkRecommendations();
    const optimization = aiEngine.getOptimalDifficulty();

    res.json({
        success: true,
        recommendations,
        miningOptimization: optimization,
        timestamp: new Date().toISOString()
    });
});

// Self-Learning - Feed transaction to AI for learning
app.post('/api/ai/learn', async (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({
            success: false,
            error: 'AI Engine not initialized'
        });
    }

    try {
        const transaction = req.body;
        const result = await aiEngine.learnFromTransaction(transaction);

        res.json({
            success: true,
            learning: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== ADVANCED AI ENDPOINTS ====================
// Features 6-10: Unique to CHEESE Blockchain

// Whale Alert System - Detect large token movements
app.post('/api/ai/whale-alert', (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({ success: false, error: 'AI Engine not initialized' });
    }

    const transaction = req.body;
    const analysis = aiEngine.analyzeWhaleActivity(transaction);

    res.json({
        success: true,
        whaleAnalysis: analysis
    });
});

// Network Health Score - Comprehensive network rating
app.get('/api/ai/health-score', (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({ success: false, error: 'AI Engine not initialized' });
    }

    const healthScore = aiEngine.calculateNetworkHealthScore();

    res.json({
        success: true,
        healthScore
    });
});

// Smart Contract Scanner - Vulnerability detection
app.post('/api/ai/scan-contract', (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({ success: false, error: 'AI Engine not initialized' });
    }

    const { code } = req.body;
    const scan = aiEngine.scanSmartContract(code || '');

    res.json({
        success: true,
        scan
    });
});

// Energy Efficiency Index - Environmental impact
app.get('/api/ai/energy', (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({ success: false, error: 'AI Engine not initialized' });
    }

    const energy = aiEngine.calculateEnergyEfficiency();

    res.json({
        success: true,
        energy
    });
});

// Decentralization Index - Network decentralization score
app.get('/api/ai/decentralization', (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({ success: false, error: 'AI Engine not initialized' });
    }

    const decentralization = aiEngine.calculateDecentralizationScore();

    res.json({
        success: true,
        decentralization
    });
});

// Full AI Status - All 10 features
app.get('/api/ai/full-status', (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({ success: false, error: 'AI Engine not initialized' });
    }

    res.json({
        success: true,
        ai: aiEngine.getFullStatus()
    });
});

// ==================== SUPPLY INTEGRITY VERIFICATION ====================

// Supply Verification - Check total NCH supply integrity
app.get('/api/supply/verify', (req, res) => {
    if (!blockchain) {
        return res.status(503).json({ success: false, error: 'Blockchain not initialized' });
    }

    try {
        const integrity = blockchain.verifySupplyIntegrity();

        res.json({
            success: true,
            supplyCheck: {
                valid: integrity.valid,
                totalSupply: integrity.totalSupply,
                expectedSupply: integrity.expectedSupply,
                difference: integrity.difference,
                walletCount: integrity.walletCount,
                issues: integrity.issues,
                status: integrity.valid ? 'HEALTHY' : 'DISCREPANCY_DETECTED',
                checkedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Whale Alert - Large transaction detection AI
app.get('/api/ai/whale-alert', (req, res) => {
    if (!aiEngine) {
        return res.status(503).json({ success: false, error: 'AI Engine not initialized' });
    }

    try {
        // Get recent large transactions (whales)
        const threshold = parseFloat(req.query.threshold) || 10000; // Default 10k CHEESE
        const alerts = [];

        if (blockchain && blockchain.chain) {
            if (blockchain.chain.length === 0) {
                console.log('📦 Blockchain is empty, creating genesis block...');
                const genesisBlock = blockchain.createGenesisBlock();
                blockchain.chain = [genesisBlock];
                // Assuming blockchain.database.saveBlock is an async operation
                // and the original code intended to save the genesis block.
                // The original snippet had an unmatched '{' after this line,
                // which has been removed to maintain syntactical correctness.
                // If further logic was intended here, it needs to be explicitly provided.
                // await blockchain.database.saveBlock(genesisBlock);
            }
            // Scan recent blocks for large transactions
            const recentBlocks = blockchain.chain.slice(-10);
            for (const block of recentBlocks) {
                if (block.transactions) {
                    for (const tx of block.transactions) {
                        if (tx.amount >= threshold) {
                            alerts.push({
                                type: 'whale_movement',
                                txHash: tx.signature || tx.hash || 'N/A',
                                from: tx.fromAddress,
                                to: tx.toAddress,
                                amount: tx.amount,
                                timestamp: tx.timestamp || block.timestamp,
                                blockIndex: block.index,
                                severity: tx.amount >= threshold * 10 ? 'critical' : tx.amount >= threshold * 5 ? 'high' : 'medium'
                            });
                        }
                    }
                }
            }
        }

        res.json({
            success: true,
            whaleAlert: {
                threshold,
                alertCount: alerts.length,
                alerts: alerts.slice(0, 20), // Return max 20 alerts
                modelType: 'whale_detection_ai',
                analyzedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== GUARDIAN AI ENDPOINTS (USER PROTECTION) ====================
// ORIGINAL FEATURES - No other blockchain has these!

// Check transaction safety before sending
app.post('/api/guardian/check-transaction', async (req, res) => {
    if (!guardianAI) {
        return res.status(503).json({ success: false, error: 'Guardian AI not initialized' });
    }

    try {
        const { from, to, amount } = req.body;

        // Get user context (transaction history) if available
        let userContext = {};
        if (blockchain && blockchainReady) {
            const history = await blockchain.getTransactionHistory(from);
            const amounts = history.map(tx => tx.amount || 0);
            userContext = {
                averageAmount: amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 100,
                transactionCount: history.length,
                balance: blockchain.getBalance(from) || 0
            };
        }

        const result = await guardianAI.checkTransaction({ from, to, amount }, userContext);

        res.json({
            success: true,
            guardian: result
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Report a scam address
app.post('/api/guardian/report-scam', async (req, res) => {
    if (!guardianAI) {
        return res.status(503).json({ success: false, error: 'Guardian AI not initialized' });
    }

    try {
        const { address, reporterAddress, evidence } = req.body;

        if (!address || !reporterAddress) {
            return res.status(400).json({ success: false, error: 'address and reporterAddress required' });
        }

        const result = await guardianAI.reportScam(address, reporterAddress, evidence);

        res.json({
            success: true,
            report: result
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Check if address is a scam
app.get('/api/guardian/scam-check/:address', (req, res) => {
    if (!guardianAI) {
        return res.status(503).json({ success: false, error: 'Guardian AI not initialized' });
    }

    const { address } = req.params;
    const isScam = guardianAI.isScamAddress(address);

    res.json({
        success: true,
        address,
        isScam,
        recommendation: isScam ? 'DO NOT TRANSACT' : 'Address not flagged'
    });
});

// Create undoable transaction (for large amounts)
app.post('/api/guardian/create-undoable', (req, res) => {
    if (!guardianAI) {
        return res.status(503).json({ success: false, error: 'Guardian AI not initialized' });
    }

    try {
        const { from, to, amount } = req.body;

        const result = guardianAI.createUndoableTransaction({ from, to, amount });

        res.json({
            success: true,
            undoable: result
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cancel a pending undoable transaction
app.post('/api/guardian/cancel-transaction', (req, res) => {
    if (!guardianAI) {
        return res.status(503).json({ success: false, error: 'Guardian AI not initialized' });
    }

    try {
        const { txId, cancellerAddress } = req.body;

        if (!txId || !cancellerAddress) {
            return res.status(400).json({ success: false, error: 'txId and cancellerAddress required' });
        }

        const result = guardianAI.cancelTransaction(txId, cancellerAddress);

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get undo status for a transaction
app.get('/api/guardian/undo-status/:txId', (req, res) => {
    if (!guardianAI) {
        return res.status(503).json({ success: false, error: 'Guardian AI not initialized' });
    }

    const { txId } = req.params;
    const status = guardianAI.getUndoStatus(txId);

    res.json({
        success: true,
        status
    });
});

// Setup social recovery guardians
app.post('/api/guardian/setup-recovery', (req, res) => {
    if (!guardianAI) {
        return res.status(503).json({ success: false, error: 'Guardian AI not initialized' });
    }

    try {
        const { userAddress, guardians, threshold } = req.body;

        if (!userAddress || !guardians || !Array.isArray(guardians)) {
            return res.status(400).json({ success: false, error: 'userAddress and guardians array required' });
        }

        const result = guardianAI.setupRecovery(userAddress, guardians, threshold || 2);

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Initiate wallet recovery
app.post('/api/guardian/initiate-recovery', (req, res) => {
    if (!guardianAI) {
        return res.status(503).json({ success: false, error: 'Guardian AI not initialized' });
    }

    try {
        const { lostAddress, newAddress, guardianAddress } = req.body;

        if (!lostAddress || !newAddress || !guardianAddress) {
            return res.status(400).json({ success: false, error: 'lostAddress, newAddress, and guardianAddress required' });
        }

        const result = guardianAI.initiateRecovery(lostAddress, newAddress, guardianAddress);

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get recovery status
app.get('/api/guardian/recovery-status/:address', (req, res) => {
    if (!guardianAI) {
        return res.status(503).json({ success: false, error: 'Guardian AI not initialized' });
    }

    const { address } = req.params;
    const status = guardianAI.getRecoveryStatus(address);

    res.json({
        success: true,
        recovery: status
    });
});

// Get plain language transaction explanation (beginner mode)
app.post('/api/guardian/explain', (req, res) => {
    if (!guardianAI) {
        return res.status(503).json({ success: false, error: 'Guardian AI not initialized' });
    }

    try {
        const { transaction, userLevel } = req.body;
        const explanation = guardianAI.explainTransaction(transaction, userLevel || 'beginner');

        res.json({
            success: true,
            explanation
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add known address to contacts
app.post('/api/guardian/add-contact', (req, res) => {
    if (!guardianAI) {
        return res.status(503).json({ success: false, error: 'Guardian AI not initialized' });
    }

    try {
        const { userAddress, contactAddress, label } = req.body;

        if (!userAddress || !contactAddress) {
            return res.status(400).json({ success: false, error: 'userAddress and contactAddress required' });
        }

        const result = guardianAI.addKnownAddress(userAddress, contactAddress, label);

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== BLOCKCHAIN INFO ENDPOINTS ====================

// Blockchain Info - Comprehensive blockchain statistics
app.get('/api/blockchain/info', (req, res) => {
    if (!blockchainReady || !blockchain) {
        return res.status(503).json({ success: false, error: 'Blockchain not initialized' });
    }

    try {
        const chain = blockchain.chain || [];
        const pendingTxs = blockchain.pendingTransactions || [];

        // Calculate total transactions
        let totalTransactions = 0;
        let totalVolume = 0;
        for (const block of chain) {
            if (block.transactions) {
                totalTransactions += block.transactions.length;
                for (const tx of block.transactions) {
                    totalVolume += tx.amount || 0;
                }
            }
        }

        res.json({
            success: true,
            blockchain: {
                name: 'CHEESE Blockchain',
                symbol: 'CHEESE',
                version: '1.0.0',
                chainLength: chain.length,
                pendingTransactions: pendingTxs.length,
                totalTransactions,
                totalVolume,
                difficulty: blockchain.difficulty || 4,
                miningReward: blockchain.miningReward || 10,
                genesisTimestamp: chain[0]?.timestamp || null,
                latestBlockTimestamp: chain[chain.length - 1]?.timestamp || null,
                latestBlockHash: chain[chain.length - 1]?.hash || null,
                isValid: blockchain.isChainValid ? blockchain.isChainValid() : true,
                aiEnabled: !!aiEngine,
                firestoreConnected: !blockchainError,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get blockchain chain data
app.get('/api/chain', (req, res) => {
    if (!blockchainReady || !blockchain) {
        return res.status(503).json({ success: false, error: 'Blockchain not initialized' });
    }

    try {
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;
        const chain = blockchain.chain || [];

        // Return paginated block data (without full transaction details for performance)
        const blocks = chain.slice(offset, offset + limit).map(block => ({
            index: block.index,
            timestamp: block.timestamp,
            hash: block.hash,
            previousHash: block.previousHash,
            nonce: block.nonce,
            transactionCount: block.transactions?.length || 0,
            miner: block.miner || 'Genesis'
        }));

        res.json({
            success: true,
            chain: {
                totalBlocks: chain.length,
                returned: blocks.length,
                offset,
                limit,
                blocks
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// List all wallets
app.get('/api/wallets', async (req, res) => {
    if (!blockchainReady || !blockchain) {
        return res.status(503).json({ success: false, error: 'Blockchain not initialized' });
    }

    try {
        const wallets = [];

        // Get wallets from wallet manager if available
        if (blockchain.walletManager && blockchain.walletManager.getAllAddresses) {
            const addresses = await blockchain.walletManager.getAllAddresses();
            for (const address of addresses) {
                const balance = blockchain.getBalanceOfAddress(address);
                wallets.push({ address, balance });
            }
        } else if (blockchain.balances) {
            // Fallback: get from balance map
            for (const [address, balance] of Object.entries(blockchain.balances)) {
                wallets.push({ address, balance });
            }
        }

        // Sort by balance descending
        wallets.sort((a, b) => b.balance - a.balance);

        res.json({
            success: true,
            wallets: {
                count: wallets.length,
                list: wallets.slice(0, 100), // Return max 100 wallets
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== WALLET ENDPOINTS ====================

// Create new wallet
app.post('/api/wallet/create', async (req, res) => {
    try {
        const { password } = req.body;

        if (!blockchain || !blockchain.walletManager) {
            return res.status(500).json({
                success: false,
                error: 'Blockchain not initialized'
            });
        }

        const wallet = await blockchain.walletManager.createWallet(password);

        res.json({
            success: true,
            wallet: {
                address: wallet.address,
                publicKey: wallet.publicKey,
                // In production, never send private key - client generates it
                message: 'Wallet created successfully. Save your private key securely!'
            }
        });
    } catch (error) {
        console.error('Create wallet error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Load wallet
app.post('/api/wallet/load', async (req, res) => {
    try {
        const { address, password } = req.body;

        if (!address) {
            return res.status(400).json({
                success: false,
                error: 'Address is required'
            });
        }

        if (!blockchain || !blockchain.walletManager) {
            return res.status(500).json({
                success: false,
                error: 'Blockchain not initialized'
            });
        }

        const wallet = await blockchain.walletManager.loadWallet(address, password);

        if (!wallet) {
            return res.status(404).json({
                success: false,
                error: 'Wallet not found or invalid password'
            });
        }

        res.json({
            success: true,
            wallet: {
                address: wallet.address,
                publicKey: wallet.publicKey
            }
        });
    } catch (error) {
        console.error('Load wallet error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== TRANSACTION ENDPOINTS ====================

// Create transaction (with signature - client-side signing)
app.post('/api/transaction', async (req, res) => {
    const startTime = Date.now();
    console.log('📥 Received transaction request at:', new Date().toISOString());

    try {
        if (!blockchainReady || !blockchain) {
            console.error('❌ Blockchain not ready');
            return res.status(503).json({
                success: false,
                reason: 'Blockchain is still initializing. Please try again in a few seconds.'
            });
        }

        console.log('📥 Parsing request body...');
        const { from, to, amount, signature, data, timestamp } = req.body;
        console.log('📥 Request data:', {
            from: from ? from.substring(0, 10) + '...' : 'missing',
            to: to ? to.substring(0, 10) + '...' : 'missing',
            amount: amount,
            hasSignature: !!signature,
            hasPublicKey: !!signature?.publicKey,
            timestamp: timestamp
        });

        // Validate required fields
        if (!from || !to || amount === undefined || amount === null) {
            console.error('❌ Missing required fields');
            return res.status(400).json({
                success: false,
                reason: 'Missing required fields: from, to, amount'
            });
        }

        if (!signature) {
            console.error('❌ Missing signature');
            return res.status(400).json({
                success: false,
                reason: 'Transaction signature is required. All transactions must be cryptographically signed.'
            });
        }

        if (!signature.publicKey) {
            console.error('❌ Missing publicKey in signature');
            return res.status(400).json({
                success: false,
                reason: 'Signature must include publicKey for verification'
            });
        }

        // Validate amount
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            console.error('❌ Invalid amount:', amount);
            return res.status(400).json({
                success: false,
                reason: 'Valid positive amount is required'
            });
        }

        console.log('📥 Calling blockchain.createTransaction...');
        // Create transaction with signature
        // CRITICAL: Pass timestamp from client for signature verification
        const result = await blockchain.createTransaction(
            from,
            to,
            amountNum,
            data || {},
            signature,
            timestamp || Date.now() // Use client timestamp if provided
        );

        const processingTime = Date.now() - startTime;
        console.log(`📥 Transaction processing took ${processingTime}ms`);

        if (result.success) {
            console.log('✅ Transaction created successfully:', {
                from,
                to,
                amount: amountNum,
                transactionId: result.transaction?.id || 'N/A',
                processingTime: `${processingTime}ms`
            });

            res.json({
                success: true,
                transaction: result.transaction,
                message: 'Transaction created and added to pending pool'
            });
        } else {
            console.error('❌ Transaction creation failed:', result.reason);
            res.status(400).json(result);
        }
    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error('❌ Transaction endpoint error:', error);
        console.error('❌ Error stack:', error.stack);
        console.error(`❌ Error occurred after ${processingTime}ms`);
        res.status(500).json({
            success: false,
            reason: error.message || 'Internal server error'
        });
    }
});

// CRITICAL: Legacy Asset Recovery Endpoint
// Allows users to migrate locked BSC assets to CHEESE Chain automatically
app.post('/api/recover-legacy', async (req, res) => {
    try {
        const { privateKey } = req.body;
        if (!privateKey) return res.status(400).json({ success: false, error: "Private Key Required" });

        console.log("📥 Recovery Request Received");

        // 1. Derive Legacy Address (Double-SHA256)
        const crypto = require('crypto');
        const cleanKey = privateKey.replace(/^0x/, '');
        const privBytes = Buffer.from(cleanKey, 'hex');
        const hash1 = crypto.createHash('sha256').update(privBytes).digest();
        const hash2 = crypto.createHash('sha256').update(hash1).digest();
        const legacyAddr = '0x' + hash2.slice(0, 20).toString('hex');

        // 2. Derive Standard Address
        const { ethers } = require('ethers');
        const wallet = new ethers.Wallet(privateKey);
        const stdAddr = wallet.address;

        console.log(`📍 Recovery: Legacy=${legacyAddr} -> Standard=${stdAddr}`);

        // 3. Check BSC Balance
        const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
        const bnbBal = await provider.getBalance(legacyAddr);

        // Check USDT
        const usdtContract = new ethers.Contract(
            '0x55d398326f99059fF775485246999027B3197955',
            ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
            provider
        );
        const usdtBal = await usdtContract.balanceOf(legacyAddr);
        const usdtDecimals = await usdtContract.decimals();

        const bnbVal = parseFloat(ethers.formatEther(bnbBal));
        const usdtVal = parseFloat(ethers.formatUnits(usdtBal, usdtDecimals));

        console.log(`💰 Locked: ${bnbVal} BNB, ${usdtVal} USDT`);

        if (bnbVal <= 0 && usdtVal <= 0) {
            return res.status(400).json({ success: false, error: "No locked assets found to recover." });
        }

        // 4. Mint Replacement Tokens
        const minted = [];
        if (bnbVal > 0) {
            await blockchain.createSystemTransaction(stdAddr, bnbVal, {
                type: 'bridge_in',
                tokenSymbol: 'CHEESE-BNB',
                legacyAddress: legacyAddr,
                note: 'Legacy Recovery'
            });
            minted.push(`${bnbVal} CHEESE-BNB`);
        }
        if (usdtVal > 0) {
            await blockchain.createSystemTransaction(stdAddr, usdtVal, {
                type: 'bridge_in',
                tokenSymbol: 'CHEESE-USDT',
                legacyAddress: legacyAddr,
                note: 'Legacy Recovery'
            });
            minted.push(`${usdtVal} CHEESE-USDT`);
        }

        res.json({
            success: true,
            message: `Successfully Recovered: ${minted.join(', ')}`,
            targetAddress: stdAddr
        });

    } catch (e) {
        console.error("Recovery Error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==================== BALANCE ENDPOINTS ====================

// Get balance
app.get('/api/balance/:address', async (req, res) => {
    try {
        const { address } = req.params;

        if (!address) {
            return res.status(400).json({
                success: false,
                error: 'Address is required'
            });
        }

        const balance = await blockchain.getBalance(address);

        res.json({
            success: true,
            address: address,
            balance: balance
        });
    } catch (error) {
        console.error('Get balance error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== MINING ENDPOINTS ====================

// Mine block
app.post('/api/mine', async (req, res) => {
    try {
        const { minerAddress } = req.body;

        if (!minerAddress) {
            return res.status(400).json({
                success: false,
                error: 'Miner address is required'
            });
        }

        const block = await blockchain.minePendingTransactions(minerAddress);

        if (block) {
            // Find mining reward transaction to get reward amount
            const rewardTx = block.transactions.find(tx =>
                tx.data && tx.data.type === 'mining_reward' && tx.to === minerAddress
            );
            const reward = rewardTx ? rewardTx.amount : blockchain.miningReward;

            console.log('✅ Block mined successfully:', {
                index: block.index,
                transactions: block.transactions.length,
                miner: minerAddress,
                reward: reward
            });

            res.json({
                success: true,
                block: block,
                reward: reward, // Include reward in response
                message: 'Block mined successfully'
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Failed to mine block'
            });
        }
    } catch (error) {
        console.error('Mine block error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== BLOCKCHAIN ENDPOINTS ====================

// Get blockchain info
app.get('/api/blockchain', (req, res) => {
    try {
        res.json({
            success: true,
            chain: blockchain.chain, // Include full chain for mining
            chainLength: blockchain.chain.length,
            pendingTransactions: blockchain.pendingTransactions,
            pendingTransactionsCount: blockchain.pendingTransactions.length,
            difficulty: blockchain.difficulty,
            miningReward: blockchain.miningReward,
            lastBlock: blockchain.chain[blockchain.chain.length - 1] || null
        });
    } catch (error) {
        console.error('Get blockchain error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get pending transactions
app.get('/api/transactions/pending', (req, res) => {
    try {
        res.json({
            success: true,
            transactions: blockchain.pendingTransactions,
            count: blockchain.pendingTransactions.length
        });
    } catch (error) {
        console.error('Get pending transactions error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get transactions for address
app.get('/api/transactions/:address', async (req, res) => {
    try {
        const { address } = req.params;

        const transactions = [];
        for (const block of blockchain.chain) {
            for (const tx of block.transactions) {
                if (tx.from === address || tx.to === address) {
                    transactions.push(tx);
                }
            }
        }

        res.json({
            success: true,
            address: address,
            transactions: transactions,
            count: transactions.length
        });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== DEX TRANSFER ENDPOINT ====================
// Privileged endpoint for DEX to update balances after swaps
// This allows the DEX to credit/debit tokens without requiring user signatures

app.post('/api/dex/transfer', async (req, res) => {
    try {
        const { from, to, amount, tokenSymbol, swapId, type } = req.body;

        // Validate inputs
        if (!to || amount === undefined || !tokenSymbol) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: to, amount, tokenSymbol'
            });
        }

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Amount must be a positive number'
            });
        }

        // Only process NCH transfers on this blockchain
        // USDT and other tokens are handled by their respective chains
        if (tokenSymbol !== 'NCH' && tokenSymbol !== 'NCHEESE') {
            return res.json({
                success: true,
                message: `${tokenSymbol} transfers not processed on NCH chain`,
                processed: false
            });
        }

        // For DEX swaps, we credit the output token to the user
        // The DEX pool reserves are the source of truth
        if (blockchain && blockchain.getWalletManager) {
            const walletManager = blockchain.getWalletManager();

            if (type === 'credit') {
                // Credit NCH to user (they received NCH from swap)
                const currentBalance = await walletManager.getBalance(to) || 0;
                await walletManager.setBalance(to, currentBalance + amountNum);
                console.log(`🔄 DEX Credit: +${amountNum} NCH to ${to}`);
            } else if (type === 'debit') {
                // Debit NCH from user (they sold NCH in swap)
                const currentBalance = await walletManager.getBalance(from) || 0;
                if (currentBalance < amountNum) {
                    return res.status(400).json({
                        success: false,
                        error: 'Insufficient balance'
                    });
                }
                await walletManager.setBalance(from, currentBalance - amountNum);
                console.log(`🔄 DEX Debit: -${amountNum} NCH from ${from}`);
            }
        }

        res.json({
            success: true,
            message: `DEX ${type} processed`,
            tokenSymbol,
            amount: amountNum,
            address: type === 'credit' ? to : from,
            swapId,
            processed: true
        });

    } catch (error) {
        console.error('DEX transfer error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== SUPPLY ENDPOINTS (CoinMarketCap / CoinGecko) ====================

// NCHEESE Token Economics
const MAX_SUPPLY = 21000000;       // 21 million NCHEESE (fixed, like Bitcoin)
const CIRCULATING_SUPPLY = 4000000; // 4 million NCHEESE currently in circulation
// Remaining 17 million is still mineable

// Get full supply info (JSON format for CoinMarketCap)
app.get('/api/supply', (req, res) => {
    res.json({
        success: true,
        data: {
            max_supply: MAX_SUPPLY,
            total_supply: MAX_SUPPLY,
            circulating_supply: CIRCULATING_SUPPLY,
            mineable_remaining: MAX_SUPPLY - CIRCULATING_SUPPLY,
            symbol: 'NCH',
            name: 'Native Cheesecoin',
            decimals: 6
        }
    });
});

// Get total supply (raw number for CMC/CoinGecko)
app.get('/api/total-supply', (req, res) => {
    res.type('text/plain').send(MAX_SUPPLY.toString());
});

// Get circulating supply (raw number for CMC/CoinGecko)
app.get('/api/circulating-supply', (req, res) => {
    res.type('text/plain').send(CIRCULATING_SUPPLY.toString());
});

// Get max supply (raw number for CMC/CoinGecko)
app.get('/api/max-supply', (req, res) => {
    res.type('text/plain').send(MAX_SUPPLY.toString());
});

// Get top holders (for CoinGecko Top Holder List URL)
app.get('/api/holders', async (req, res) => {
    try {
        let holders = [];

        if (blockchain && blockchain.getWalletManager) {
            const walletManager = blockchain.getWalletManager();
            if (walletManager && walletManager.getAllBalances) {
                const balances = await walletManager.getAllBalances();
                // Convert to array and sort by balance descending
                holders = Object.entries(balances)
                    .map(([address, balance]) => ({ address, balance: balance || 0 }))
                    .filter(h => h.balance > 0)
                    .sort((a, b) => b.balance - a.balance)
                    .slice(0, 100); // Top 100 holders
            }
        }

        // Calculate total for percentage
        const totalHeld = holders.reduce((sum, h) => sum + h.balance, 0);

        res.json({
            success: true,
            symbol: 'NCH',
            total_holders: holders.length,
            circulating_supply: CIRCULATING_SUPPLY,
            holders: holders.map((h, index) => ({
                rank: index + 1,
                address: h.address,
                balance: h.balance,
                percentage: ((h.balance / CIRCULATING_SUPPLY) * 100).toFixed(4)
            }))
        });
    } catch (error) {
        console.error('Holders endpoint error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ==================== ROUTES ====================
// CRITICAL: Load core blockchain routes (Wallet, Transaction, Mining)
// This must be BEFORE the 404 handler
require('./blockchain-server-routes')(app, () => blockchain, () => blockchainReady);

// Handle all other routes - serve Landing Page for Blockchain Service
app.get('*', (req, res) => {
    // Don't intercept API routes (though they should be handled above)
    if (req.path.startsWith('/api')) {
        return res.status(404).json({
            success: false,
            error: 'API endpoint not found'
        });
    }
    // Serve the Blockchain Landing Page instead of Wallet UI
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// ==================== START SERVER FIRST ====================
// CRITICAL: Start server IMMEDIATELY to pass health checks
// ==================== START SERVER ====================
// Check if running directly (node blockchain-server.js) or imported (Cloud Functions)
if (require.main === module) {
    // CRITICAL: Start server IMMEDIATELY to pass health checks
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🧀 CHEESE Blockchain Server running on port ${PORT}`);
        console.log(`📡 API available at: http://0.0.0.0:${PORT}/api`);
        console.log(`✅ Server is ready to accept connections`);

        // Start blockchain initialization AFTER server starts (non-blocking)
        (async () => {
            // ... existing initialization code ...
            try {
                console.log('🔄 Initializing CHEESE Blockchain...');
                // CRITICAL: Use Firestore for permanent storage
                // CRITICAL: Use specific collection prefix for Blockchain Project
                blockchain = new EnhancedHybridBlockchainAI({
                    useFirestore: process.env.USE_FIRESTORE === 'true', // Respect env var
                    projectId: 'cheese-blockchain', // Primary (New)
                    backupProjectId: 'cheese-tree-network', // Backup (Old)
                    backupKeyFilename: './service-account.json.old', // Key for Backup
                    dbPath: './cheese-blockchain.db', // Fallback for local dev
                    miningReward: 50,
                    difficulty: 2
                });

                // Initialize with timeout to prevent hanging
                const initPromise = blockchain.initialize();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Initialization timeout after 60 seconds')), 60000)
                );

                await Promise.race([initPromise, timeoutPromise]);
                blockchainReady = true;
                blockchainError = null;
                console.log('✅ CHEESE Blockchain initialized successfully!');
                console.log(`📊 Chain length: ${blockchain.chain.length}`);
                console.log(`⏰ Genesis block timestamp: ${blockchain.chain[0]?.timestamp || 'N/A'}`);

                // Initialize AI Engine with blockchain reference
                try {
                    aiEngine = new CheeseAIEngine(blockchain, blockchain.database);
                    console.log('🧠 AI Engine initialized with 5 core features!');
                } catch (aiError) {
                    console.error('⚠️ AI Engine initialization failed:', aiError.message);
                    // Continue without AI - not critical
                }

                // Initialize Guardian AI for user protection
                try {
                    guardianAI = new GuardianAI({
                        undoWindowMinutes: 5,
                        largeTransactionThreshold: 1000
                    });
                    console.log('🛡️ Guardian AI initialized for user protection!');
                } catch (guardianError) {
                    console.error('⚠️ Guardian AI initialization failed:', guardianError.message);
                }
            } catch (error) {
                console.error('❌ Failed to initialize blockchain:', error);
                console.error('❌ Error stack:', error.stack);
                blockchainError = error.message;
                blockchainReady = false;
                // Don't exit - allow health check to work
                // Server will still respond, but blockchain operations will fail gracefully

                // IMPORTANT: Still try to initialize AI Engine even if blockchain failed
                // AI features can work independently using mock/fallback data
                try {
                    aiEngine = new CheeseAIEngine(blockchain, blockchain.database);
                    console.log('🧠 AI Engine initialized (blockchain in fallback mode)');
                } catch (aiError) {
                    console.error('⚠️ AI Engine initialization failed:', aiError.message);
                }
            }
        })();
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
} else {
    // Export for Cloud Functions
    // We need to initialize the blockchain asynchronously when the function cold-starts
    // But Cloud Functions are stateless request handlers.
    // We'll initialize lazily on the first request.

    // Lazy initialization wrapper
    const initBlockchain = async () => {
        if (blockchain) return; // Already initialized

        try {
            console.log('🔄 Cloud Function: Initializing Blockchain...');
            blockchain = new EnhancedHybridBlockchainAI({
                useFirestore: true, // Always use firestore in cloud
                projectId: 'cheese-blockchain',
                miningReward: 50,
                difficulty: 2
            });
            await blockchain.initialize();
            blockchainReady = true;

            // Init AI
            aiEngine = new CheeseAIEngine(blockchain, blockchain.database);
            // Init Guardian
            guardianAI = new GuardianAI();

            console.log('✅ Cloud Function: Blockchain Initialized');
        } catch (e) {
            console.error('❌ Cloud Function Init Error:', e);
            blockchainError = e.message;
        }
    };

    // Middleware to ensure init
    app.use(async (req, res, next) => {
        if (!blockchain && !blockchainReady) {
            await initBlockchain();
        }
        next();
    });
}

module.exports = app;















